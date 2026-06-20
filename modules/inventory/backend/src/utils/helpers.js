import { v4 as uuidv4 } from 'uuid';
import { parseIpForStorage } from './ipAddress.js';

export function newId() {
  return uuidv4();
}

const VALID_STATUS = new Set(['Active', 'Decommissioned', 'Maintenance', 'Spare']);

export function normalizeStatus(s) {
  if (!s || typeof s !== 'string') return 'Active';
  const t = s.trim();
  if (VALID_STATUS.has(t)) return t;
  const lower = t.toLowerCase();
  if (lower === 'decom' || lower === 'decommissioned' || lower === 'decommission') {
    return 'Decommissioned';
  }
  if (lower === 'active') return 'Active';
  if (lower === 'maintenance') return 'Maintenance';
  if (lower === 'spare') return 'Spare';
  return 'Active';
}

/** SQLite SQLITE_CONSTRAINT_UNIQUE (Node's node:sqlite uses numeric errcode). */
export function isUniqueConstraintError(e) {
  return (
    e?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    e?.errcode === 2067 ||
    /UNIQUE constraint failed/i.test(String(e?.message || ''))
  );
}

export function parseCsvRow(row) {
  const vendor = (row.Vendor ?? row.vendor ?? '').toString().trim();
  const model = (row.Model ?? row.model ?? '').toString().trim();
  const networkElementRaw = (row['Network Element'] ?? row.network_element ?? row.NetworkElement ?? '')
    .toString()
    .trim();
  const network_element = networkElementRaw || null;
  const serial = (row['Serial Number'] ?? row.serial_number ?? row.Serial ?? '')
    .toString()
    .trim();
  const routerTypeRaw = row['Router Type'] ?? row.router_type ?? row.RouterType ?? '';
  const router_type = routerTypeRaw ? String(routerTypeRaw).trim() || null : null;
  const eolRaw = row['End of Life (YYYY-MM-DD)'] ?? row.end_of_life ?? row.EOL ?? '';
  const eol = eolRaw ? String(eolRaw).trim() || null : null;
  const status = normalizeStatus(row.Status ?? row.status);
  const rack = (row['Rack Position'] ?? row.rack_position ?? row.Rack ?? '')
    .toString()
    .trim() || null;
  const ipRaw = row['IP Address'] ?? row['IP address'] ?? row.ip_address ?? row.IP ?? '';
  let ip_address = null;
  if (ipRaw) {
    const parsed = parseIpForStorage(String(ipRaw).trim());
    ip_address = parsed.ok ? parsed.value : String(ipRaw).trim() || null;
  }
  const softwareVersionRaw = row['Software Version'] ?? row.software_version ?? '';
  const software_version = softwareVersionRaw ? String(softwareVersionRaw).trim() || null : null;
  const descriptorVersionRaw = row['Descriptor Version'] ?? row.descriptor_version ?? '';
  const descriptor_version = descriptorVersionRaw ? String(descriptorVersionRaw).trim() || null : null;

  /** Optional chassis (same row): total slots + either utilization pattern (0/1) or utilized count. */
  const chassis_total_slots = (
    row['Total Chassis Slot'] ??
    row['Chassis Slot'] ??
    row['Chassis Slots'] ??
    row['Chassis Total Slots'] ??
    row.chassis_total_slots ??
    ''
  )
    .toString()
    .trim();
  const chassis_utilized_count = (
    row['Utilized Chassis Count'] ??
    row['Chassis Utilized Count'] ??
    row.chassis_utilized_count ??
    row['Chassis Utilized'] ??
    ''
  )
    .toString()
    .trim();
  const chassis_utilization_pattern = (
    row['Utilized Chassis Slot'] ??
    row['Chassis Utilization Pattern'] ??
    row['Chassis Pattern'] ??
    row.chassis_utilization_pattern ??
    ''
  )
    .toString()
    .trim();
  /** Easier than 0/1 pattern: e.g. 1-8 or 1,3,5 (1-based bay indices). Requires Total Chassis Slot. */
  const chassis_bays_in_use = (
    row['Chassis Bays In Use'] ?? row['Chassis Utilized Ranges'] ?? row.chassis_bays_in_use ?? ''
  )
    .toString()
    .trim();

  /** Optional ports (one logical slot per row): total + pattern or utilized count + optional descriptions (pipe-separated). */
  const port_slot_name = (row['Slot Name'] ?? row.slot_name ?? '').toString().trim();
  const port_total = (
    row['Total Port Slot'] ??
    row['Port Total'] ??
    row['Total Ports'] ??
    row.port_total ??
    ''
  )
    .toString()
    .trim();
  const port_utilized_count = (
    row['Utilized Port Count'] ?? row['Port Utilized Count'] ?? row.port_utilized_count ?? ''
  )
    .toString()
    .trim();
  const port_utilization_pattern = (
    row['Utilized Port Slot'] ??
    row['Port Utilization Pattern'] ??
    row['Port Pattern'] ??
    row.port_utilization_pattern ??
    ''
  )
    .toString()
    .trim();
  /** Easier than 0/1 pattern: e.g. 1-22 or 1-20,45-46 (1-based port numbers). Requires Total Port Slot. */
  const ports_in_use = (row['Ports In Use'] ?? row['Port Utilized Ranges'] ?? row.ports_in_use ?? '')
    .toString()
    .trim();
  const port_descriptions = (row['Port Descriptions'] ?? row.port_descriptions ?? '').toString();

  return {
    vendor,
    model,
    network_element,
    serial_number: serial,
    router_type,
    end_of_life: eol,
    status,
    rack_position: rack,
    ip_address,
    software_version,
    descriptor_version,
    chassis_total_slots,
    chassis_utilized_count,
    chassis_utilization_pattern,
    chassis_bays_in_use,
    port_slot_name,
    port_total,
    port_utilized_count,
    port_utilization_pattern,
    ports_in_use,
    port_descriptions,
  };
}

export function parseSiteCsvRow(row) {
  const name = (row['Site Name'] ?? row.name ?? row.site_name ?? '').toString().trim();
  const plaid = (row.PLAID ?? row.plaid ?? '').toString().trim();
  const region = (row.Region ?? row.region ?? '').toString().trim();
  const area = (row.Territory ?? row.Area ?? row.area ?? row.territory ?? '').toString().trim();
  const addressRaw = row.Address ?? row.address ?? '';
  const address = addressRaw ? String(addressRaw).trim() || null : null;
  const latRaw = row.Latitude ?? row.lat ?? '';
  const lngRaw = row.Longitude ?? row.lng ?? '';
  const lat =
    latRaw === '' || latRaw == null ? null : Number(String(latRaw).trim().replace(/^["'\s]+|["'\s]+$/g, ''));
  const lng =
    lngRaw === '' || lngRaw == null ? null : Number(String(lngRaw).trim().replace(/^["'\s]+|["'\s]+$/g, ''));
  return { name, plaid, region, area, address, lat, lng };
}

export const VALID_REGIONS = new Set(['NCR', 'NLZ', 'SLZ', 'VIS', 'MIN', 'INTERNATIONAL']);

const INTERNATIONAL_AREA_CODES = new Set(['ITL', 'INTL', 'INTERNATIONAL']);

function isInternationalAreaCode(value) {
  return INTERNATIONAL_AREA_CODES.has(String(value || '').trim().toUpperCase());
}

/** Map spreadsheet region/territory codes (e.g. ITL + 7) to canonical region + territory. */
export function normalizeSiteRegionAndArea(parsed) {
  let region = String(parsed.region || '').trim();
  let area = String(parsed.area || '').trim();
  const plaid = String(parsed.plaid || '').trim().toUpperCase();
  const international =
    isInternationalAreaCode(region) ||
    isInternationalAreaCode(area) ||
    plaid.startsWith('ITL');

  if (international) {
    region = 'INTERNATIONAL';
    if (isInternationalAreaCode(area)) {
      area = 'ITL';
    } else if (isInternationalAreaCode(parsed.region)) {
      area = 'ITL';
    } else if (!area) {
      area = 'ITL';
    }
    return { region, area };
  }

  if (region) region = region.toUpperCase();
  return { region, area };
}

export function normalizeSiteName(name) {
  const raw = (name || '').toString().trim();
  return raw ? raw.toUpperCase() : '';
}

/** Normalize site CSV row for insert; only PLAID is required — other site fields may be blank. */
export function normalizeSiteRowForInsert(parsed) {
  const plaid = (parsed.plaid || '').trim();
  if (!plaid) return { error: 'PLAID is required' };

  const { region: regionRaw, area } = normalizeSiteRegionAndArea(parsed);

  if (regionRaw && !VALID_REGIONS.has(regionRaw)) {
    return { error: `Invalid Region: ${parsed.region || regionRaw}` };
  }

  if (parsed.lat !== null && (Number.isNaN(parsed.lat) || parsed.lat < -90 || parsed.lat > 90)) {
    return { error: 'Latitude must be between -90 and 90' };
  }
  if (parsed.lng !== null && (Number.isNaN(parsed.lng) || parsed.lng < -180 || parsed.lng > 180)) {
    return { error: 'Longitude must be between -180 and 180' };
  }

  const nameRaw = normalizeSiteName(parsed.name);
  const plaidUpper = normalizeSiteName(plaid) || plaid;
  return {
    ok: true,
    name: nameRaw || plaidUpper,
    plaid,
    area,
    region: regionRaw,
    address: parsed.address ?? null,
    lat: parsed.lat,
    lng: parsed.lng,
  };
}

export function importRowError(line, message, siteParsed = {}) {
  const plaid = (siteParsed.plaid || '').trim();
  const name = (siteParsed.name || '').trim();
  return {
    line,
    message,
    ...(plaid ? { plaid } : {}),
    ...(name ? { site_name: name } : {}),
  };
}

/**
 * Line-slot display order: numeric-aware names (e.g. "Slot 2" before "Slot 10"), case-insensitive.
 * @param {string} [aName]
 * @param {string} [bName]
 * @returns {number}
 */
export function compareSlotDisplayOrder(aName, bName) {
  const sa = String(aName ?? '').trim();
  const sb = String(bName ?? '').trim();
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}
