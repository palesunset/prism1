import db from '../db/index.js';
import { newId, parseCsvRow } from '../utils/helpers.js';

export const VALID_ROUTER_TYPES = new Set(['P', 'DR', 'BR', 'PEe', 'PEc', 'FMAGG', 'AGG', 'AG', 'RR']);

const MAX_CHASSIS_SLOTS = 10_000;
const MAX_PORTS_PER_SLOT = 20_000;

export function parse01Pattern(pattern, label) {
  const p = (pattern || '').toString().trim();
  if (!p) return { flags: null };
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c !== '0' && c !== '1') {
      return { error: `${label} must use only 0 and 1 (position ${i + 1}: invalid character)` };
    }
  }
  return { flags: [...p].map((ch) => ch === '1') };
}

export function parseIndexRangesToFlags(total, spec, label) {
  const s = (spec || '').toString().trim();
  if (!s) return { error: `${label} cannot be empty` };
  if (!Number.isInteger(total) || total < 1) return { error: `${label}: invalid total` };
  const flags = Array(total).fill(false);
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeM = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeM) {
      let a = Number(rangeM[1]);
      let b = Number(rangeM[2]);
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        return { error: `${label}: invalid range "${part}"` };
      }
      if (a > b) [a, b] = [b, a];
      if (a < 1 || b > total) {
        return { error: `${label}: range "${part}" must stay within 1–${total}` };
      }
      for (let i = a; i <= b; i++) flags[i - 1] = true;
      continue;
    }
    const oneM = part.match(/^(\d+)$/);
    if (oneM) {
      const n = Number(oneM[1]);
      if (!Number.isInteger(n) || n < 1 || n > total) {
        return { error: `${label}: "${part}" must be a single index 1–${total}` };
      }
      flags[n - 1] = true;
      continue;
    }
    return { error: `${label}: cannot parse "${part}" (try e.g. 1-22 or 1-10,15)` };
  }
  return { flags };
}

export function resolveChassisFromCsv(parsed) {
  const patIn = parse01Pattern(parsed.chassis_utilization_pattern, 'Utilized Chassis Slot');
  if (patIn.error) return patIn;
  if (patIn.flags && patIn.flags.length > 0) {
    const n = patIn.flags.length;
    if (n > MAX_CHASSIS_SLOTS) return { error: `Utilized Chassis Slot pattern exceeds ${MAX_CHASSIS_SLOTS} slots` };
    const totRaw = (parsed.chassis_total_slots || '').toString().trim();
    if (totRaw) {
      const tot = Number(totRaw);
      if (!Number.isInteger(tot) || tot !== n) {
        return { error: `Total Chassis Slot (${totRaw}) must equal Utilized Chassis Slot pattern length (${n})` };
      }
    }
    return { total: n, flags: patIn.flags };
  }
  const totRaw = (parsed.chassis_total_slots || '').toString().trim();
  const baysInUse = (parsed.chassis_bays_in_use || '').toString().trim();
  if (baysInUse) {
    if (!totRaw) {
      return { error: 'Total Chassis Slot is required when Chassis Bays In Use is set' };
    }
    const total = Number(totRaw);
    if (!Number.isInteger(total) || total < 1 || total > MAX_CHASSIS_SLOTS) {
      return { error: `Total Chassis Slot must be an integer 1–${MAX_CHASSIS_SLOTS} when using Chassis Bays In Use` };
    }
    const flagsR = parseIndexRangesToFlags(total, baysInUse, 'Chassis Bays In Use');
    if (flagsR.error) return flagsR;
    return { total, flags: flagsR.flags };
  }
  if (!totRaw) return { total: null, flags: null };
  const total = Number(totRaw);
  if (!Number.isInteger(total) || total < 0 || total > MAX_CHASSIS_SLOTS) {
    return { error: `Total Chassis Slot must be an integer 0–${MAX_CHASSIS_SLOTS}` };
  }
  if (total === 0) return { total: 0, flags: [] };
  const cntRaw = (parsed.chassis_utilized_count || '').toString().trim();
  let k = 0;
  if (cntRaw) {
    k = Number(cntRaw);
    if (!Number.isInteger(k) || k < 0 || k > total) {
      return { error: 'Utilized Chassis Count must be an integer between 0 and Total Chassis Slot' };
    }
  }
  const flags = Array.from({ length: total }, (_, i) => i < k);
  return { total, flags };
}

export function resolvePortsFromCsv(parsed) {
  const totRaw = (parsed.port_total || '').toString().trim();
  const patIn = parse01Pattern(parsed.port_utilization_pattern, 'Utilized Port Slot');
  if (patIn.error) return patIn;
  if (!totRaw) {
    if (patIn.flags && patIn.flags.length) {
      return { error: 'Total Port Slot is required when Utilized Port Slot is set' };
    }
    return { total: null, flags: null, descriptions: null };
  }
  const total = Number(totRaw);
  if (!Number.isInteger(total) || total < 1 || total > MAX_PORTS_PER_SLOT) {
    return { error: `Total Port Slot must be an integer 1–${MAX_PORTS_PER_SLOT}` };
  }
  const portsInUse = (parsed.ports_in_use || '').toString().trim();
  let flags;
  if (portsInUse) {
    const flagsR = parseIndexRangesToFlags(total, portsInUse, 'Ports In Use');
    if (flagsR.error) return flagsR;
    flags = flagsR.flags;
  } else if (patIn.flags && patIn.flags.length > 0) {
    if (patIn.flags.length !== total) {
      return { error: `Utilized Port Slot length (${patIn.flags.length}) must equal Total Port Slot (${total})` };
    }
    flags = patIn.flags;
  } else {
    const cntRaw = (parsed.port_utilized_count || '').toString().trim();
    let k = 0;
    if (cntRaw) {
      k = Number(cntRaw);
      if (!Number.isInteger(k) || k < 0 || k > total) {
        return { error: 'Utilized Port Count must be an integer between 0 and Total Port Slot' };
      }
    }
    flags = Array.from({ length: total }, (_, i) => i < k);
  }
  const rawDesc = parsed.port_descriptions;
  if (rawDesc != null && String(rawDesc).trim() !== '') {
    const parts = String(rawDesc).split('|').map((s) => String(s).trim());
    if (parts.length > total) {
      return { error: 'Port Descriptions has more pipe-separated segments than Total Port Slot' };
    }
    const descriptions = Array.from({ length: total }, (_, i) => parts[i] ?? '');
    return { total, flags, descriptions };
  }
  return { total, flags, descriptions: Array(total).fill('') };
}

export function rowHasEquipment(parsed) {
  const vendor = (parsed.vendor || '').trim();
  const model = (parsed.model || '').trim();
  const serial = (parsed.serial_number || '').trim();
  return Boolean(vendor || model || serial);
}

/** All three core fields present — required to import equipment from CSV. */
export function rowHasCompleteEquipment(parsed) {
  const vendor = (parsed.vendor || '').trim();
  const model = (parsed.model || '').trim();
  const serial = (parsed.serial_number || '').trim();
  return Boolean(vendor && model && serial);
}

export function validateEquipmentRow(parsed) {
  if (!parsed.vendor || !parsed.model || !parsed.serial_number) {
    return 'Vendor, Model, and Serial Number are required for equipment rows';
  }
  if (parsed.router_type && !VALID_ROUTER_TYPES.has(parsed.router_type)) {
    return `Invalid Router Type: ${parsed.router_type}`;
  }
  const chassisRes = resolveChassisFromCsv(parsed);
  if (chassisRes.error) return chassisRes.error;
  const portsRes = resolvePortsFromCsv(parsed);
  if (portsRes.error) return portsRes.error;
  return null;
}

export function importEquipmentFromParsed(siteId, parsed, existingSerials, batchSerials) {
  const validationError = validateEquipmentRow(parsed);
  if (validationError) return { ok: false, error: validationError };

  if (batchSerials.has(parsed.serial_number) || existingSerials.has(parsed.serial_number)) {
    return { ok: false, error: `Duplicate serial number: ${parsed.serial_number}` };
  }

  const chassisRes = resolveChassisFromCsv(parsed);
  const portsRes = resolvePortsFromCsv(parsed);
  const id = newId();
  const neImport =
    (parsed.network_element && String(parsed.network_element).trim()) || parsed.model;
  const chassisN = chassisRes.total;

  const insertEq = db.prepare(
    `INSERT INTO equipment (id, site_id, vendor, model, network_element, serial_number, router_type, end_of_life, status, rack_position, chassis_slot_count, ip_address, software_version, descriptor_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertBay = db.prepare(
    `INSERT INTO equipment_bays (id, equipment_id, slot_index, label, is_utilized, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, datetime('now'), datetime('now'))`
  );
  const insertSlot = db.prepare(
    `INSERT INTO slots (id, equipment_id, slot_name, total_ports) VALUES (?, ?, ?, ?)`
  );
  const insertPort = db.prepare(
    `INSERT INTO ports (id, slot_id, port_number, is_utilized, description) VALUES (?, ?, ?, ?, ?)`
  );

  try {
    db.exec('BEGIN IMMEDIATE');
    insertEq.run(
      id,
      siteId,
      parsed.vendor,
      parsed.model,
      neImport,
      parsed.serial_number,
      parsed.router_type ?? null,
      parsed.end_of_life,
      parsed.status,
      parsed.rack_position,
      chassisN != null ? chassisN : null,
      parsed.ip_address ?? null,
      parsed.software_version ?? null,
      parsed.descriptor_version ?? null
    );
    if (chassisN != null && chassisN > 0 && chassisRes.flags && chassisRes.flags.length === chassisN) {
      for (let idx = 1; idx <= chassisN; idx++) {
        const utilized = chassisRes.flags[idx - 1] ? 1 : 0;
        insertBay.run(newId(), id, idx, utilized);
      }
    }
    if (portsRes.total != null && portsRes.flags && portsRes.descriptions) {
      const slotName = (parsed.port_slot_name || '').trim() || 'Main';
      const slotId = newId();
      insertSlot.run(slotId, id, slotName, portsRes.total);
      for (let pn = 1; pn <= portsRes.total; pn++) {
        const utilized = portsRes.flags[pn - 1] ? 1 : 0;
        const desc = portsRes.descriptions[pn - 1] != null ? String(portsRes.descriptions[pn - 1]) : '';
        insertPort.run(newId(), slotId, pn, utilized, desc);
      }
    }
    db.exec('COMMIT');
    existingSerials.add(parsed.serial_number);
    batchSerials.add(parsed.serial_number);
    return { ok: true };
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    return { ok: false, error: e.message || 'Insert failed' };
  }
}
