import { Router } from 'express';
import db, { runWithFtsRecovery } from '../db/index.js';
import {
  newId,
  parseCsvRow,
  normalizeStatus,
  isUniqueConstraintError,
  compareSlotDisplayOrder,
} from '../utils/helpers.js';
import {
  VALID_ROUTER_TYPES,
  importEquipmentFromParsed,
  rowHasEquipment,
  rowHasCompleteEquipment,
} from '../utils/equipmentImport.js';
import { parseUploadCsvBuffer } from '../utils/csvUpload.js';
import { getRateLimiters } from '../middleware/security.js';
import { csvUpload, readUploadedFileBuffer } from '../utils/csvMulter.js';
import {
  parseIpForStorage,
  findDuplicateIpEquipment,
  findEquipmentByIp,
} from '../utils/ipAddress.js';

import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();
const uploadLimiter = getRateLimiters().upload;
const upload = csvUpload;

router.get('/vendors', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT DISTINCT TRIM(vendor) AS vendor FROM equipment WHERE vendor IS NOT NULL AND TRIM(vendor) != '' ORDER BY LOWER(vendor)`
    )
    .all();
  res.json(rows.map((r) => r.vendor));
});

router.get('/by-ip', async (req, res) => {
  const address = String(req.query.address ?? '').trim();
  if (!address) {
    res.status(400).json({ detail: 'address query parameter is required' });
    return;
  }
  const result = await findEquipmentByIp(address);
  if (!result.ok) {
    res.status(400).json({ detail: result.error });
    return;
  }
  res.json({ matches: result.matches });
});

async function getEquipmentUtilization(equipmentId) {
  const row = await db
    .prepare(
      `
    SELECT
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM slots s
    LEFT JOIN ports p ON p.slot_id = s.id
    WHERE s.equipment_id = ?
  `
    )
    .get(equipmentId);
  const total = row.total_ports || 0;
  const used = row.utilized_ports || 0;
  return { total_ports: total, utilized_ports: used, free_ports: total - used };
}

router.post('/', async (req, res) => {
  const {
    site_id,
    vendor,
    model,
    network_element,
    serial_number,
    router_type,
    end_of_life,
    status,
    rack_position,
    chassis_slot_count,
    ip_address,
    software_version,
    descriptor_version,
  } = req.body || {};
  if (!site_id || !vendor || !model || !serial_number) {
    return res.status(400).json({ error: 'site_id, vendor, model, and serial_number are required' });
  }
  const neTrim = network_element != null ? String(network_element).trim() : '';
  const network_element_value = neTrim || String(model).trim();
  const site = await db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(400).json({ error: 'Invalid site_id' });

  const id = newId();
  const st = normalizeStatus(status);
  const chassisN =
    chassis_slot_count === undefined || chassis_slot_count === null || chassis_slot_count === ''
      ? null
      : Number(chassis_slot_count);
  if (chassisN !== null && (!Number.isInteger(chassisN) || chassisN < 0 || chassisN > 10_000)) {
    return res.status(400).json({ error: 'chassis_slot_count must be an integer between 0 and 10000' });
  }
  const ipParsed = parseIpForStorage(ip_address);
  if (!ipParsed.ok) {
    return res.status(400).json({ error: ipParsed.error });
  }
  const ip = ipParsed.value;
  if (ip) {
    const dupes = await findDuplicateIpEquipment(ip);
    if (dupes.length > 0) {
      return res.status(409).json({
        error: `IP ${ip} is already assigned to another device (${dupes[0].serial_number})`,
      });
    }
  }
  const rt =
    router_type === undefined || router_type === null || String(router_type).trim() === ''
      ? null
      : String(router_type).trim();
  if (rt && !VALID_ROUTER_TYPES.has(rt)) {
    return res.status(400).json({ error: 'Invalid router_type' });
  }
  const softwareVer =
    software_version === undefined || software_version === null || String(software_version).trim() === ''
      ? null
      : String(software_version).trim();
  const descriptorVer =
    descriptor_version === undefined ||
    descriptor_version === null ||
    String(descriptor_version).trim() === ''
      ? null
      : String(descriptor_version).trim();
  try {
    await db.prepare(
      `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, end_of_life, status, rack_position, chassis_slot_count, ip_address, software_version, descriptor_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      site_id,
      vendor,
      model,
      network_element_value,
      serial_number,
      rt,
      end_of_life || null,
      st,
      rack_position ?? null,
      chassisN,
      ip,
      softwareVer,
      descriptorVer
    );
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return res.status(400).json({ error: 'Serial number must be unique within this site' });
    }
    throw e;
  }
  if (chassisN != null) {
    const insert = db.prepare(
      `INSERT INTO equipment_bays (id, equipment_id, slot_index, label, is_utilized, created_at, updated_at)
       VALUES (?, ?, ?, '', 0, datetime('now'), datetime('now'))`,
    );
    await db.exec('BEGIN IMMEDIATE');
    try {
      for (let idx = 1; idx <= chassisN; idx++) {
        await insert.run(newId(), id, idx);
      }
      await db.exec('COMMIT');
    } catch (e) {
      try {
        await db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      // If bays creation fails, still return the equipment row (data is valid); user can init later.
    }
  }
  const row = await db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
  res.status(201).json(row);
});

router.post('/import', uploadLimiter, upload.single('file'), async (req, res) => {
  const siteId = req.body.site_id;
  if (!siteId) {
    return res.status(400).json({ error: 'site_id is required' });
  }
  const site = await db.prepare('SELECT id FROM sites WHERE id = ?').get(siteId);
  if (!site) return res.status(400).json({ error: 'Invalid site_id' });
  const fileBuffer = await readUploadedFileBuffer(req.file);
  if (!fileBuffer) {
    return res.status(400).json({ error: 'CSV file is required (field name: file)' });
  }

  const existingSerials = new Set(
    (await db.prepare('SELECT serial_number FROM equipment WHERE site_id = ?').all(siteId)).map((r) => r.serial_number),
  );
  const batchIps = new Set();

  const rows = await parseUploadCsvBuffer(fileBuffer);

  let added = 0;
  const errors = [];
  const batchSerials = new Set();

  for (let i = 0; i < rows.length; i++) {
    const line = i + 2;
    const parsed = parseCsvRow(rows[i]);
    if (!rowHasEquipment(parsed)) continue;
    if (!rowHasCompleteEquipment(parsed)) continue;
    const result = await importEquipmentFromParsed(siteId, parsed, existingSerials, batchSerials, batchIps);
    if (result.ok) {
      added++;
    } else {
      errors.push({ line, message: result.error });
    }
  }

  res.json({
    success: errors.length === 0,
    added,
    skipped: errors.length,
    errors,
  });
});

router.patch('/:id', async (req, res) => {
  const existing = await db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Equipment not found' });

  const {
    vendor,
    model,
    network_element,
    serial_number,
    router_type,
    end_of_life,
    status,
    rack_position,
    ip_address,
    software_version,
    descriptor_version,
  } = req.body || {};
  const updates = [];
  const vals = [];

  if (vendor !== undefined) {
    updates.push('vendor = ?');
    vals.push(vendor);
  }
  if (model !== undefined) {
    updates.push('model = ?');
    vals.push(model);
  }
  if (network_element !== undefined) {
    const ne =
      network_element === null || String(network_element).trim() === ''
        ? null
        : String(network_element).trim();
    updates.push('network_element = ?');
    vals.push(ne);
  }
  if (serial_number !== undefined) {
    updates.push('serial_number = ?');
    vals.push(serial_number);
  }
  if (end_of_life !== undefined) {
    updates.push('end_of_life = ?');
    vals.push(end_of_life || null);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    vals.push(normalizeStatus(status));
  }
  if (rack_position !== undefined) {
    updates.push('rack_position = ?');
    vals.push(rack_position ?? null);
  }
  if (ip_address !== undefined) {
    const ipParsed = parseIpForStorage(ip_address);
    if (!ipParsed.ok) {
      return res.status(400).json({ error: ipParsed.error });
    }
    if (ipParsed.value) {
      const dupes = await findDuplicateIpEquipment(ipParsed.value, req.params.id);
      if (dupes.length > 0) {
        return res.status(409).json({
          error: `IP ${ipParsed.value} is already assigned to another device (${dupes[0].serial_number})`,
        });
      }
    }
    updates.push('ip_address = ?');
    vals.push(ipParsed.value);
  }
  if (router_type !== undefined) {
    const rt =
      router_type === null || router_type === '' || String(router_type).trim() === ''
        ? null
        : String(router_type).trim();
    if (rt && !VALID_ROUTER_TYPES.has(rt)) {
      return res.status(400).json({ error: 'Invalid router_type' });
    }
    updates.push('router_type = ?');
    vals.push(rt);
  }
  if (software_version !== undefined) {
    updates.push('software_version = ?');
    vals.push(
      software_version === null || software_version === '' || String(software_version).trim() === ''
        ? null
        : String(software_version).trim()
    );
  }
  if (descriptor_version !== undefined) {
    updates.push('descriptor_version = ?');
    vals.push(
      descriptor_version === null ||
        descriptor_version === '' ||
        String(descriptor_version).trim() === ''
        ? null
        : String(descriptor_version).trim()
    );
  }

  if (updates.length === 0) {
    return res.json(existing);
  }

  updates.push("updated_at = datetime('now')");
  vals.push(req.params.id);

  try {
    await db.prepare(`UPDATE equipment SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return res.status(400).json({ error: 'Serial number must be unique within this site' });
    }
    throw e;
  }

  const row = await db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  res.json(row);
});

router.get('/:id', async (req, res) => {
  const eq = await db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!eq) return res.status(404).json({ error: 'Equipment not found' });

  const slots = await db.prepare('SELECT * FROM slots WHERE equipment_id = ?').all(eq.id);
  slots.sort((a, b) => {
    const c = compareSlotDisplayOrder(a.slot_name, b.slot_name);
    if (c !== 0) return c;
    return String(a.id).localeCompare(String(b.id));
  });
  const slotIds = slots.map((s) => s.id);
  let portsBySlot = {};
  if (slotIds.length) {
    const placeholders = slotIds.map(() => '?').join(',');
    const ports = await db
      .prepare(`SELECT * FROM ports WHERE slot_id IN (${placeholders}) ORDER BY port_number`)
      .all(...slotIds);
    portsBySlot = ports.reduce((acc, p) => {
      if (!acc[p.slot_id]) acc[p.slot_id] = [];
      acc[p.slot_id].push({
        ...p,
        is_utilized: Boolean(p.is_utilized),
      });
      return acc;
    }, {});
  }

  const slotsWithPorts = slots.map((s) => ({
    ...s,
    ports: portsBySlot[s.id] || [],
  }));

  const util = await getEquipmentUtilization(eq.id);
  const total = util.total_ports;
  const used = util.utilized_ports;
  const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

  const slotBreakdown = slotsWithPorts.map((s) => {
    const t = s.ports.length;
    const u = s.ports.filter((p) => p.is_utilized).length;
    return {
      slot_id: s.id,
      slot_name: s.slot_name,
      total_ports: t,
      utilized_ports: u,
      utilization_pct: t > 0 ? Math.round((u / t) * 1000) / 10 : 0,
    };
  });

  res.json({
    equipment: eq,
    slots: slotsWithPorts,
    utilization: {
      ...util,
      utilization_pct: pct,
    },
    slot_breakdown: slotBreakdown,
  });
});

router.delete('/:id', async (req, res) => {
  const r = await runWithFtsRecovery(async () =>
    await db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id),
  );
  if (r.changes === 0) return res.status(404).json({ error: 'Equipment not found' });
  res.status(204).send();
});

promisifyRouter(router);

export default router;
