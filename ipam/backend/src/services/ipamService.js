import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { logAudit } from './ipamAudit.js';
import { checkHostAssignment, runPostSaveIntegrityScan } from './ipamIntegrity.js';
import {
  containsRange,
  ipInRange,
  octetsToString,
  parseAddressInput,
  rangesOverlap,
  uint32ToIp,
  validationSummary,
} from '../lib/ipMath.js';

export function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    address: row.address,
    record_type: row.record_type,
    status: row.status,
    project: row.project ?? '',
    vlan: row.vlan,
    location: row.location,
    description: row.description,
    cidr_prefix: row.cidr_prefix,
    range_start: row.range_start,
    range_end: row.range_end,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listRecords(filters = {}) {
  let sql = 'SELECT * FROM ip_records WHERE 1=1';
  const params = [];
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.record_type) {
    sql += ' AND record_type = ?';
    params.push(filters.record_type);
  }
  if (filters.project) {
    sql += ' AND project LIKE ?';
    params.push(`%${filters.project}%`);
  }
  if (filters.q) {
    sql += ' AND (address LIKE ? OR project LIKE ? OR location LIKE ? OR description LIKE ? OR vlan LIKE ?)';
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY range_start ASC, updated_at DESC';
  return db.prepare(sql).all(...params).map(rowToRecord);
}

export function getRecord(id) {
  return rowToRecord(db.prepare('SELECT * FROM ip_records WHERE id = ?').get(id));
}

function describeConflict(existing, parsed, incomingMeta) {
  const existingLabel = `${existing.address} (${existing.record_type}, ${existing.status})`;
  const incomingLabel = parsed.normalized;
  const incomingType = incomingMeta.record_type;
  const incomingStatus = incomingMeta.status ?? 'used';

  if (existing.record_type === 'host' && incomingType === 'host' && existing.range_start === parsed.rangeStart) {
    return {
      type: 'duplicate_host',
      message: `Duplicate host assignment: ${incomingLabel} is already registered.`,
      existing,
      suggestion: `Remove or update record ${existing.id} (${existing.project || 'no project'}) before re-assigning.`,
    };
  }

  if (existing.record_type === 'subnet' && incomingType === 'subnet') {
    if (existing.range_start === parsed.rangeStart && existing.range_end === parsed.rangeEnd) {
      return {
        type: 'duplicate_subnet',
        message: `Subnet ${incomingLabel} is already registered.`,
        existing,
        suggestion: 'Use the existing subnet record or delete it before creating a duplicate.',
      };
    }
    if (rangesOverlap(existing.range_start, existing.range_end, parsed.rangeStart, parsed.rangeEnd)) {
      return {
        type: 'subnet_overlap',
        message: `Subnet ${incomingLabel} overlaps with existing subnet ${existing.address}.`,
        existing,
        affectedRange: `${octetsToString(uint32ToIp(Math.max(existing.range_start, parsed.rangeStart)))} – ${octetsToString(uint32ToIp(Math.min(existing.range_end, parsed.rangeEnd)))}`,
        suggestion: 'Adjust CIDR boundaries so subnets do not overlap, or consolidate under a single parent block.',
      };
    }
    return null;
  }

  if (existing.record_type === 'subnet' && incomingType === 'host') {
    if (ipInRange(parsed.rangeStart, existing.range_start, existing.range_end)) {
      return null;
    }
  }

  if (existing.record_type === 'host' && incomingType === 'subnet') {
    if (ipInRange(existing.range_start, parsed.rangeStart, parsed.rangeEnd)) {
      return null;
    }
  }

  if (rangesOverlap(existing.range_start, existing.range_end, parsed.rangeStart, parsed.rangeEnd)) {
    return {
      type: 'range_overlap',
      message: `${incomingLabel} overlaps with ${existingLabel}.`,
      existing,
      suggestion: 'Resolve overlapping allocations before saving.',
    };
  }

  return null;
}

export function detectConflicts(parsed, excludeId = null, incomingMeta = {}) {
  const rows = db.prepare('SELECT * FROM ip_records').all();
  const conflicts = [];
  const meta = {
    record_type: incomingMeta.record_type ?? parsed.recordType,
    status: incomingMeta.status ?? 'used',
  };
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    const existing = rowToRecord(row);
    const conflict = describeConflict(existing, parsed, meta);
    if (conflict) conflicts.push(conflict);
  }
  return conflicts;
}

export function insertRecord(id, body) {
  const recordType = body.record_type === 'host' ? 'host' : 'subnet';
  if (recordType === 'subnet' && !String(body.address ?? '').includes('/')) {
    return { error: 'Subnet records must use CIDR notation (e.g. 10.1.1.0/24).' };
  }
  const parsed = parseAddressInput(body.address, recordType);
  if (parsed.error) return { error: parsed.error };

  if (recordType === 'host') {
    const hostRole = checkHostAssignment(parsed);
    if (hostRole) return { error: hostRole.message, conflicts: [hostRole] };
  }

  const conflicts = detectConflicts(parsed, null, { record_type: recordType, status: body.status });
  const blocking = conflicts.filter((c) =>
    ['duplicate_host', 'duplicate_subnet', 'subnet_overlap', 'range_overlap'].includes(c.type),
  );
  if (blocking.length > 0) {
    return { error: blocking[0].message, conflicts: blocking };
  }

  const status = ['free', 'used', 'reserved'].includes(body.status) ? body.status : 'used';
  try {
    db.prepare(
      `INSERT INTO ip_records (id, address, record_type, status, project, vlan, location, description, cidr_prefix, range_start, range_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      parsed.normalized,
      recordType,
      status,
      String(body.project ?? ''),
      body.vlan ?? null,
      body.location ?? null,
      body.description ?? null,
      parsed.prefix,
      parsed.rangeStart,
      parsed.rangeEnd,
    );
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return {
        error: `Duplicate host assignment: ${parsed.normalized} is already registered.`,
        conflicts: [{
          type: 'duplicate_host',
          message: `Duplicate host assignment: ${parsed.normalized} is already registered.`,
        }],
      };
    }
    throw e;
  }
  logAudit('create', id, parsed.normalized, { record_type: recordType, status, project: body.project ?? '' });
  const integrity = runPostSaveIntegrityScan('create', id, parsed.normalized);
  return { record: getRecord(id), conflicts: conflicts.filter((c) => !blocking.includes(c)), integrity };
}

export function updateRecord(id, body) {
  const existing = getRecord(id);
  if (!existing) return { error: 'Record not found' };

  const address = body.address !== undefined ? body.address : existing.address;
  const recordType = body.record_type !== undefined ? body.record_type : existing.record_type;
  const parsed = parseAddressInput(address, recordType);
  if (parsed.error) return { error: parsed.error };

  if (recordType === 'host') {
    const hostRole = checkHostAssignment(parsed);
    if (hostRole) return { error: hostRole.message, conflicts: [hostRole] };
  }

  const conflicts = detectConflicts(parsed, id, { record_type: recordType, status: body.status ?? existing.status });
  const blocking = conflicts.filter((c) =>
    ['duplicate_host', 'duplicate_subnet', 'subnet_overlap', 'range_overlap'].includes(c.type),
  );
  if (blocking.length > 0) {
    return { error: blocking[0].message, conflicts: blocking };
  }

  const fields = {
    address: parsed.normalized,
    record_type: recordType,
    cidr_prefix: parsed.prefix,
    range_start: parsed.rangeStart,
    range_end: parsed.rangeEnd,
  };
  if (body.status !== undefined) fields.status = body.status;
  if (body.project !== undefined) fields.project = String(body.project);
  if (body.vlan !== undefined) fields.vlan = body.vlan;
  if (body.location !== undefined) fields.location = body.location;
  if (body.description !== undefined) fields.description = body.description;

  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE ip_records SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  logAudit('update', id, parsed.normalized, { record_type: recordType, status: fields.status ?? existing.status });
  const integrity = runPostSaveIntegrityScan('update', id, parsed.normalized);
  return { record: getRecord(id), conflicts: conflicts.filter((c) => !blocking.includes(c)), integrity };
}

export function deleteRecord(id) {
  const existing = getRecord(id);
  const result = db.prepare('DELETE FROM ip_records WHERE id = ?').run(id);
  if (result.changes > 0 && existing) {
    logAudit('delete', id, existing.address, { record_type: existing.record_type });
    runPostSaveIntegrityScan('delete', id, existing.address);
  }
  return result.changes > 0;
}

export function searchQuery(query) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return { error: 'Enter an IP address or subnet to search.' };

  const hasSlash = trimmed.includes('/');
  const parsed = parseAddressInput(trimmed, hasSlash ? 'subnet' : 'host');
  if (parsed.error) return { error: parsed.error };

  const all = listRecords();
  const exact = all.filter((r) => r.address === parsed.normalized || r.range_start === parsed.rangeStart);
  const containingSubnets = all.filter(
    (r) =>
      r.record_type === 'subnet' &&
      containsRange(r.range_start, r.range_end, parsed.rangeStart, parsed.rangeEnd),
  );
  const members = all.filter(
    (r) =>
      r.record_type === 'host' &&
      parsed.recordType === 'subnet' &&
      ipInRange(r.range_start, parsed.rangeStart, parsed.rangeEnd),
  );
  const conflicts = detectConflicts(parsed, null, {
    record_type: hasSlash ? 'subnet' : 'host',
  });

  let assignmentStatus = 'unregistered';
  const hostMatch = all.find((r) => r.record_type === 'host' && r.range_start === parsed.rangeStart);
  if (hostMatch) assignmentStatus = hostMatch.status;
  else if (containingSubnets.length > 0) {
    assignmentStatus = containingSubnets[0].status;
  }

  return {
    query: trimmed,
    parsed: validationSummary(parsed),
    assignmentStatus,
    exactMatches: exact,
    containingSubnets,
    members: parsed.recordType === 'subnet' ? members : [],
    conflicts,
    membership:
      containingSubnets.length > 0
        ? `Inside subnet ${containingSubnets[0].address} (${containingSubnets[0].project || 'no project'})`
        : parsed.recordType === 'subnet'
          ? 'Root search — subnet block'
          : 'No registered parent subnet',
  };
}

export function buildDashboard() {
  const subnets = listRecords({ record_type: 'subnet' });
  const hosts = listRecords({ record_type: 'host' });

  return subnets.map((subnet) => {
    const totalIps = subnet.range_end - subnet.range_start + 1;
    const usable =
      subnet.cidr_prefix === 32
        ? 1
        : subnet.cidr_prefix === 31
          ? 2
          : totalIps > 2
            ? totalIps - 2
            : 0;
    const usedHosts = hosts.filter(
      (h) =>
        h.status !== 'free' &&
        ipInRange(h.range_start, subnet.range_start, subnet.range_end),
    ).length;
    const reservedHosts = hosts.filter(
      (h) =>
        h.status === 'reserved' &&
        ipInRange(h.range_start, subnet.range_start, subnet.range_end),
    ).length;
    const freeIps = Math.max(0, usable - usedHosts);
    const utilization = usable > 0 ? Math.round((usedHosts / usable) * 1000) / 10 : 0;

    return {
      id: subnet.id,
      address: subnet.address,
      project: subnet.project,
      location: subnet.location,
      vlan: subnet.vlan,
      network: octetsToString(uint32ToIp(subnet.range_start)),
      broadcast: octetsToString(uint32ToIp(subnet.range_end)),
      rangeLabel: `${octetsToString(uint32ToIp(subnet.range_start))} → ${octetsToString(uint32ToIp(subnet.range_end))}`,
      totalIps,
      usableHosts: usable,
      usedHosts,
      reservedHosts,
      freeIps,
      utilizationPercent: utilization,
      status: subnet.status,
    };
  });
}

export function importVlsmPlan(plan, projectName = '') {
  if (!plan?.subnets?.length) return { error: 'No subnets found in VLSM plan.' };
  const project = projectName || plan.baseNetwork || 'VLSM Import';
  const created = [];
  const errors = [];
  for (const s of plan.subnets) {
    const cidr = s.cidr ?? `${s.network}/${s.prefix}`;
    const address = cidr.includes('/') ? cidr : `${s.network}/${s.prefix}`;
    const result = insertRecord(randomUUID(), {
      address,
      record_type: 'subnet',
      status: 'reserved',
      project,
      vlan: s.vlanId ?? s.vlan ?? null,
      location: s.site ?? s.siteLabel ?? null,
      description: `Imported from VLSM — ${s.requiredHosts ?? ''} hosts required`,
    });
    if (result.error) {
      errors.push({ address, error: result.error });
    } else if (result.record) {
      created.push(result.record);
    }
  }

  logAudit('vlsm_import', null, project, { created: created.length, errors: errors.length });
  return { created, errors, project };
}

export function bulkImportCsv(csvText) {
  const lines = String(csvText ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { error: 'CSV must include a header row and at least one data row.' };

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name) => header.indexOf(name);
  const addrIdx = col('address');
  if (addrIdx < 0) return { error: 'CSV must include an Address column.' };

  const typeIdx = col('type');
  const statusIdx = col('status');
  const projectIdx = col('project');
  const vlanIdx = col('vlan');
  const locationIdx = col('location');
  const descIdx = col('description');

  const created = [];
  const errors = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const address = cells[addrIdx]?.trim();
    if (!address) continue;
    const result = insertRecord(randomUUID(), {
      address,
      record_type: typeIdx >= 0 ? cells[typeIdx]?.trim().toLowerCase() : 'host',
      status: statusIdx >= 0 ? cells[statusIdx]?.trim().toLowerCase() : 'used',
      project: projectIdx >= 0 ? cells[projectIdx]?.trim() : '',
      vlan: vlanIdx >= 0 ? cells[vlanIdx]?.trim() : null,
      location: locationIdx >= 0 ? cells[locationIdx]?.trim() : null,
      description: descIdx >= 0 ? cells[descIdx]?.trim() : null,
    });
    if (result.error) errors.push({ row: i + 1, address, error: result.error });
    else if (result.record) created.push(result.record);
  }
  logAudit('bulk_import', null, null, { created: created.length, errors: errors.length });
  return { created, errors };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function recordsToCsv(records) {
  const header = [
    'Address',
    'Type',
    'Status',
    'Project',
    'VLAN',
    'Location',
    'Description',
    'Created',
    'Updated',
  ];
  const rows = records.map((r) => [
    r.address,
    r.record_type,
    r.status,
    r.project,
    r.vlan ?? '',
    r.location ?? '',
    r.description ?? '',
    r.created_at ?? '',
    r.updated_at ?? '',
  ]);
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}
