import ipaddr from 'ipaddr.js';
import db from '../db/index.js';

/**
 * Parse and canonicalize a management IP for storage (host addresses only, no CIDR).
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
export function parseIpForStorage(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.includes('/')) {
    return { ok: false, error: 'Management IP must be a host address, not a CIDR prefix' };
  }
  try {
    const addr = ipaddr.parse(trimmed);
    if (addr.kind() === 'ipv6') {
      return { ok: true, value: addr.toString() };
    }
    return { ok: true, value: addr.toString() };
  } catch {
    return { ok: false, error: `Invalid IP address: ${trimmed}` };
  }
}

/** @returns {boolean} */
export function isValidIpAddress(raw) {
  return parseIpForStorage(raw).ok;
}

/**
 * Equipment rows sharing the same normalized IP (optionally excluding one id).
 * @returns {Promise<Array<{ id: string, site_id: string, serial_number: string, network_element: string|null, ip_address: string|null }>>}
 */
export async function findDuplicateIpEquipment(ip, excludeEquipmentId = null) {
  const parsed = parseIpForStorage(ip);
  if (!parsed.ok || !parsed.value) return [];

  const rows = await db
    .prepare(
      `SELECT id, site_id, serial_number, network_element, ip_address
       FROM equipment
       WHERE ip_address IS NOT NULL AND TRIM(ip_address) != ''`,
    )
    .all();

  return rows.filter((row) => {
    if (excludeEquipmentId && row.id === excludeEquipmentId) return false;
    const stored = parseIpForStorage(row.ip_address);
    return stored.ok && stored.value === parsed.value;
  });
}

/** @returns {Promise<Array<{ ip: string, equipment: Array<{ id: string, serial_number: string, network_element: string|null, site_id: string }> }>>} */
export async function findDuplicateIpGroups() {
  const rows = await db
    .prepare(
      `SELECT e.id, e.site_id, e.serial_number, e.network_element, e.ip_address, s.name AS site_name
       FROM equipment e
       LEFT JOIN sites s ON s.id = e.site_id
       WHERE e.ip_address IS NOT NULL AND TRIM(e.ip_address) != ''`,
    )
    .all();

  const byIp = new Map();
  for (const row of rows) {
    const parsed = parseIpForStorage(row.ip_address);
    if (!parsed.ok || !parsed.value) continue;
    if (!byIp.has(parsed.value)) byIp.set(parsed.value, []);
    byIp.get(parsed.value).push({
      id: row.id,
      serial_number: row.serial_number,
      network_element: row.network_element,
      site_id: row.site_id,
      site_name: row.site_name,
    });
  }

  return [...byIp.entries()]
    .filter(([, equipment]) => equipment.length > 1)
    .map(([ip, equipment]) => ({ ip, equipment }));
}

/** Normalize legacy ip_address values already in the database. */
export async function normalizeExistingIpAddresses() {
  const rows = await db
    .prepare(`SELECT id, ip_address FROM equipment WHERE ip_address IS NOT NULL AND TRIM(ip_address) != ''`)
    .all();
  const update = db.prepare('UPDATE equipment SET ip_address = ? WHERE id = ?');
  for (const row of rows) {
    const parsed = parseIpForStorage(row.ip_address);
    if (parsed.ok && parsed.value && parsed.value !== row.ip_address) {
      await update.run(parsed.value, row.id);
    }
  }
}

/**
 * Find equipment by normalized management IP.
 * @returns {Promise<{ ok: true, matches: object[] } | { ok: false, error: string, matches: [] }>}
 */
export async function findEquipmentByIp(rawAddress) {
  const parsed = parseIpForStorage(rawAddress);
  if (!parsed.ok) return { ok: false, error: parsed.error, matches: [] };
  if (!parsed.value) return { ok: false, error: 'address query parameter is required', matches: [] };

  const rows = await db
    .prepare(
      `SELECT e.id, e.network_element, e.vendor, e.model, e.serial_number, e.ip_address, e.status,
              s.name AS site_name, s.plaid AS site_plaid
       FROM equipment e
       LEFT JOIN sites s ON s.id = e.site_id
       WHERE e.ip_address IS NOT NULL AND TRIM(e.ip_address) != ''`,
    )
    .all();

  const matches = rows.filter((row) => {
    const stored = parseIpForStorage(row.ip_address);
    return stored.ok && stored.value === parsed.value;
  });

  return { ok: true, matches };
}
