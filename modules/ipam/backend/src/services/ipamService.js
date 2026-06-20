import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { logAudit } from './ipamAudit.js';
import { checkHostAssignment, runPostSaveIntegrityScan, validateBeforeSave } from './ipamIntegrity.js';
import {
  containsRange,
  ipInRange,
  octetsToString,
  parseAddressInput,
  rangesOverlap,
  uint32ToIp,
  validationSummary,
} from '../lib/ipMath.js';
import {
  containsParsedRange,
  pointInRecord,
  parsedFamily,
  recordFamily,
  rangesOverlapRecords,
  sameHostAddress,
  hostInSubnet,
  parsedAsRecord,
  sameSubnetBounds,
} from '../lib/ipRangeHelpers.js';
import { v6HexToDisplay } from '../lib/ipMathV6.js';
import { v6UsableHostCount } from '../lib/allocationEfficiency.js';
import { validateExtendedHostFields } from '../lib/fieldValidation.js';

const EXTENDED_FIELDS = [
  'hostname',
  'mac_address',
  'gateway',
  'dhcp_scope',
  'ptr_record',
  'parent_subnet_id',
];

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
    hostname: row.hostname ?? null,
    mac_address: row.mac_address ?? null,
    gateway: row.gateway ?? null,
    dhcp_scope: row.dhcp_scope ?? null,
    ptr_record: row.ptr_record ?? null,
    parent_subnet_id: row.parent_subnet_id ?? null,
    address_family: row.address_family ?? 'ipv4',
    v6_range_start: row.v6_range_start ?? null,
    v6_range_end: row.v6_range_end ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildListSql(filters = {}) {
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
    sql += ` AND (
      address LIKE ? OR project LIKE ? OR location LIKE ? OR description LIKE ?
      OR vlan LIKE ? OR hostname LIKE ? OR mac_address LIKE ? OR ptr_record LIKE ?
    )`;
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like, like, like, like);
  }
  sql += ` ORDER BY address_family ASC,
    CASE WHEN address_family = 'ipv6' THEN v6_range_start ELSE printf('%010d', range_start) END ASC,
    updated_at DESC`;
  return { sql, params };
}

export function listRecords(filters = {}, options = {}) {
  const { sql, params } = buildListSql(filters);
  const page = options.page ? Math.max(1, Number(options.page)) : null;
  const pageSize = options.pageSize ? Math.min(500, Math.max(1, Number(options.pageSize))) : null;

  if (page && pageSize) {
    const countRow = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) AS c')).get(...params);
    const total = countRow?.c ?? 0;
    const offset = (page - 1) * pageSize;
    const rows = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
    return {
      records: rows.map(rowToRecord),
      total,
      page,
      pageSize,
    };
  }

  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToRecord);
}

export function getRecord(id) {
  return rowToRecord(db.prepare('SELECT * FROM ip_records WHERE id = ?').get(id));
}

export function listPicklists() {
  const projects = db
    .prepare(`SELECT DISTINCT TRIM(project) AS v FROM ip_records WHERE TRIM(COALESCE(project, '')) != '' ORDER BY v`)
    .all()
    .map((r) => r.v);
  const vlans = db
    .prepare(`SELECT DISTINCT TRIM(vlan) AS v FROM ip_records WHERE TRIM(COALESCE(vlan, '')) != '' ORDER BY v`)
    .all()
    .map((r) => r.v);
  const locations = db
    .prepare(`SELECT DISTINCT TRIM(location) AS v FROM ip_records WHERE TRIM(COALESCE(location, '')) != '' ORDER BY v`)
    .all()
    .map((r) => r.v);
  return { projects, vlans, locations };
}

function hostsInSubnet(subnetId, subnet = null) {
  const s = subnet ?? getRecord(subnetId);
  if (!s || s.record_type !== 'subnet') return [];
  return listRecords().filter((r) => r.record_type === 'host' && hostInSubnet(s, r));
}

function childSubnetsOf(subnetId, subnet = null) {
  const s = subnet ?? getRecord(subnetId);
  if (!s || s.record_type !== 'subnet') return [];
  return listRecords({ record_type: 'subnet' }).filter(
    (r) =>
      r.id !== s.id &&
      recordFamily(r) === recordFamily(s) &&
      containsParsedRange(s, {
        family: recordFamily(r),
        rangeStart: r.range_start,
        rangeEnd: r.range_end,
        v6RangeStart: r.v6_range_start,
        v6RangeEnd: r.v6_range_end,
      }) &&
      (r.parent_subnet_id === s.id || !r.parent_subnet_id),
  );
}

function overlapLabel(existing, parsed) {
  if (parsedFamily(parsed) === 'ipv6') {
    const lo = v6HexToDisplay(
      existing.v6_range_start > parsed.v6RangeStart ? existing.v6_range_start : parsed.v6RangeStart,
    );
    const hi = v6HexToDisplay(
      existing.v6_range_end < parsed.v6RangeEnd ? existing.v6_range_end : parsed.v6RangeEnd,
    );
    return `${lo} – ${hi}`;
  }
  return `${octetsToString(uint32ToIp(Math.max(existing.range_start, parsed.rangeStart)))} – ${octetsToString(uint32ToIp(Math.min(existing.range_end, parsed.rangeEnd)))}`;
}

function describeConflict(existing, parsed, incomingMeta) {
  if (recordFamily(existing) !== parsedFamily(parsed)) return null;
  const existingLabel = `${existing.address} (${existing.record_type}, ${existing.status})`;
  const incomingLabel = parsed.normalized;
  const incomingType = incomingMeta.record_type;

  if (existing.record_type === 'host' && incomingType === 'host' && sameHostAddress(existing, parsed)) {
    return {
      type: 'duplicate_host',
      message: `Duplicate host assignment: ${incomingLabel} is already registered.`,
      existing,
      suggestion: `Remove or update record ${existing.id} (${existing.project || 'no project'}) before re-assigning.`,
    };
  }

  if (existing.record_type === 'subnet' && incomingType === 'subnet') {
    if (sameSubnetBounds(existing, parsed)) {
      return {
        type: 'duplicate_subnet',
        message: `Subnet ${incomingLabel} is already registered.`,
        existing,
        suggestion: 'Use the existing subnet record or delete it before creating a duplicate.',
      };
    }
    if (rangesOverlapRecords(existing, parsedAsRecord(parsed))) {
      return {
        type: 'subnet_overlap',
        message: `Subnet ${incomingLabel} overlaps with existing subnet ${existing.address}.`,
        existing,
        affectedRange: overlapLabel(existing, parsed),
        suggestion: 'Adjust CIDR boundaries so subnets do not overlap, or consolidate under a single parent block.',
      };
    }
    return null;
  }

  if (existing.record_type === 'subnet' && incomingType === 'host') {
    if (pointInRecord(existing, parsed)) return null;
  }

  if (existing.record_type === 'host' && incomingType === 'subnet') {
    if (hostInSubnet(parsedAsRecord(parsed), existing)) return null;
  }

  if (rangesOverlapRecords(existing, parsedAsRecord(parsed))) {
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
  const isV6 = parsedFamily(parsed) === 'ipv6';
  const rows = isV6
    ? db
        .prepare(
          `SELECT * FROM ip_records
         WHERE address_family = 'ipv6' AND v6_range_start <= ? AND v6_range_end >= ?`,
        )
        .all(parsed.v6RangeEnd, parsed.v6RangeStart)
    : db
        .prepare(
          `SELECT * FROM ip_records
         WHERE address_family = 'ipv4' AND range_start <= ? AND range_end >= ?`,
        )
        .all(parsed.rangeEnd, parsed.rangeStart);
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

function resolveParentSubnetId(body, parsed, recordType) {
  if (body.parent_subnet_id) return body.parent_subnet_id;
  if (recordType !== 'host') return null;
  const subnets = listRecords({ record_type: 'subnet' }).filter((s) => recordFamily(s) === parsedFamily(parsed));
  const parent = subnets.find((s) => pointInRecord(s, parsed));
  return parent?.id ?? null;
}

function validateParentSubnetId(parentId, parsed) {
  if (!parentId) return null;
  const parent = getRecord(parentId);
  if (!parent) return 'Parent subnet not found.';
  if (parent.record_type !== 'subnet') return 'Parent must be a subnet record.';
  if (recordFamily(parent) !== parsedFamily(parsed)) {
    return 'Parent subnet address family must match the record.';
  }
  if (!containsParsedRange(parent, parsed)) {
    return `Address ${parsed.normalized} is outside parent subnet ${parent.address}.`;
  }
  return null;
}

function pickExtendedFields(body) {
  const out = {};
  for (const key of EXTENDED_FIELDS) {
    if (body[key] !== undefined) {
      out[key] = body[key] === null || body[key] === '' ? null : String(body[key]);
    }
  }
  return out;
}

export function insertRecord(id, body) {
  const recordType = body.record_type === 'host' ? 'host' : 'subnet';
  if (recordType === 'subnet' && !String(body.address ?? '').includes('/')) {
    return { error: 'Subnet records must use CIDR notation (e.g. 10.1.1.0/24).' };
  }
  const parsed = parseAddressInput(body.address, recordType);
  if (parsed.error) return { error: parsed.error };

  if (recordType === 'host') {
    const hostRole = parsed.family === 'ipv6' ? null : checkHostAssignment(parsed);
    if (hostRole) return { error: hostRole.message, conflicts: [hostRole] };
  }

  const conflicts = detectConflicts(parsed, null, { record_type: recordType, status: body.status });
  const blocking = conflicts.filter((c) =>
    ['duplicate_host', 'duplicate_subnet', 'subnet_overlap', 'range_overlap'].includes(c.type),
  );
  if (blocking.length > 0) {
    return { error: blocking[0].message, conflicts: blocking };
  }

  const fieldCheck = validateExtendedHostFields(body);
  if (!fieldCheck.ok) return { error: fieldCheck.error };

  const status = ['free', 'used', 'reserved'].includes(body.status) ? body.status : 'used';
  const extended = pickExtendedFields(body);
  const parentSubnetId = extended.parent_subnet_id ?? resolveParentSubnetId(body, parsed, recordType);
  const parentErr = validateParentSubnetId(parentSubnetId, parsed);
  if (parentErr) return { error: parentErr };

  try {
    db.prepare(
      `INSERT INTO ip_records (
        id, address, record_type, status, project, vlan, location, description,
        cidr_prefix, range_start, range_end, hostname, mac_address, gateway,
        dhcp_scope, ptr_record, parent_subnet_id, address_family, v6_range_start, v6_range_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      extended.hostname ?? null,
      extended.mac_address ?? null,
      extended.gateway ?? null,
      extended.dhcp_scope ?? null,
      extended.ptr_record ?? null,
      parentSubnetId,
      parsed.family ?? 'ipv4',
      parsed.v6RangeStart ?? null,
      parsed.v6RangeEnd ?? null,
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
    const hostRole = parsed.family === 'ipv6' ? null : checkHostAssignment(parsed);
    if (hostRole) return { error: hostRole.message, conflicts: [hostRole] };
  }

  const conflicts = detectConflicts(parsed, id, { record_type: recordType, status: body.status ?? existing.status });
  const blocking = conflicts.filter((c) =>
    ['duplicate_host', 'duplicate_subnet', 'subnet_overlap', 'range_overlap'].includes(c.type),
  );
  if (blocking.length > 0) {
    return { error: blocking[0].message, conflicts: blocking };
  }

  const fieldCheck = validateExtendedHostFields(body);
  if (!fieldCheck.ok) return { error: fieldCheck.error };

  const fields = {
    address: parsed.normalized,
    record_type: recordType,
    cidr_prefix: parsed.prefix,
    range_start: parsed.rangeStart,
    range_end: parsed.rangeEnd,
    address_family: parsed.family ?? 'ipv4',
    v6_range_start: parsed.v6RangeStart ?? null,
    v6_range_end: parsed.v6RangeEnd ?? null,
  };
  if (body.status !== undefined) fields.status = body.status;
  if (body.project !== undefined) fields.project = String(body.project);
  if (body.vlan !== undefined) fields.vlan = body.vlan;
  if (body.location !== undefined) fields.location = body.location;
  if (body.description !== undefined) fields.description = body.description;

  const extended = pickExtendedFields(body);
  Object.assign(fields, extended);
  if (body.parent_subnet_id !== undefined || recordType === 'host') {
    fields.parent_subnet_id =
      body.parent_subnet_id !== undefined
        ? body.parent_subnet_id || null
        : resolveParentSubnetId(body, parsed, recordType);
  }
  const finalParentId =
    fields.parent_subnet_id !== undefined ? fields.parent_subnet_id : existing.parent_subnet_id;
  const parentErr = validateParentSubnetId(finalParentId, parsed);
  if (parentErr) return { error: parentErr };

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

export function deleteRecord(id, options = {}) {
  const existing = getRecord(id);
  if (!existing) return { deleted: false, error: 'Record not found' };

  if (existing.record_type === 'subnet') {
    const hosts = hostsInSubnet(existing.id, existing);
    const children = childSubnetsOf(existing.id, existing);
    const dependents = hosts.length + children.length;

    if (dependents > 0 && !options.cascade) {
      return {
        deleted: false,
        error: `Subnet ${existing.address} has ${hosts.length} host(s) and ${children.length} child subnet(s). Pass cascade=true to delete them, or remove dependents first.`,
        hosts: hosts.length,
        childSubnets: children.length,
      };
    }

    if (options.cascade) {
      for (const h of hosts) {
        db.prepare('DELETE FROM ip_records WHERE id = ?').run(h.id);
        logAudit('delete', h.id, h.address, { record_type: 'host', cascade_from: id });
      }
      for (const c of children) {
        deleteRecord(c.id, { cascade: true });
      }
    }
  }

  db.prepare(`UPDATE ip_workflows SET ipam_record_id = NULL WHERE ipam_record_id = ?`).run(id);
  const result = db.prepare('DELETE FROM ip_records WHERE id = ?').run(id);
  if (result.changes > 0) {
    logAudit('delete', id, existing.address, { record_type: existing.record_type, cascade: Boolean(options.cascade) });
    runPostSaveIntegrityScan('delete', id, existing.address);
    return { deleted: true };
  }
  return { deleted: false, error: 'Record not found' };
}

export function bulkUpdateStatus(ids, status) {
  if (!['free', 'used', 'reserved'].includes(status)) {
    return { error: 'Invalid status.' };
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: 'No record IDs provided.' };
  }
  const updated = [];
  const missing = [];
  for (const id of ids) {
    const existing = getRecord(id);
    if (!existing) {
      missing.push(id);
      continue;
    }
    db.prepare(`UPDATE ip_records SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    logAudit('bulk_status', id, existing.address, { status });
    updated.push(getRecord(id));
  }
  return { updated, count: updated.length, missing, missingCount: missing.length };
}

export function searchQuery(query) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return { error: 'Enter an IP address or subnet to search.' };

  const hasSlash = trimmed.includes('/');
  const parsed = parseAddressInput(trimmed, hasSlash ? 'subnet' : 'host');
  if (parsed.error) return { error: parsed.error };

  const all = listRecords();
  const exact = all.filter(
    (r) =>
      r.address === parsed.normalized ||
      sameHostAddress(r, parsed) ||
      sameSubnetBounds(r, parsed),
  );
  const containingSubnets = all.filter(
    (r) => r.record_type === 'subnet' && containsParsedRange(r, parsed),
  );
  const searchSubnet = {
    address_family: parsedFamily(parsed),
    range_start: parsed.rangeStart,
    range_end: parsed.rangeEnd,
    v6_range_start: parsed.v6RangeStart,
    v6_range_end: parsed.v6RangeEnd,
  };
  const members = all.filter(
    (r) =>
      r.record_type === 'host' &&
      parsed.recordType === 'subnet' &&
      hostInSubnet(searchSubnet, r),
  );
  const conflicts = detectConflicts(parsed, null, {
    record_type: hasSlash ? 'subnet' : 'host',
  });

  let assignmentStatus = 'unregistered';
  const hostMatch = all.find((r) => r.record_type === 'host' && sameHostAddress(r, parsed));
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
    if (recordFamily(subnet) === 'ipv6') {
      const usedHosts = hosts.filter((h) => h.status !== 'free' && hostInSubnet(subnet, h)).length;
      const reservedHosts = hosts.filter((h) => h.status === 'reserved' && hostInSubnet(subnet, h)).length;
      const networkLabel = v6HexToDisplay(subnet.v6_range_start);
      const broadcastLabel = v6HexToDisplay(subnet.v6_range_end);
      const usable = v6UsableHostCount(subnet);
      const freeIps = usable != null ? Math.max(0, usable - usedHosts) : null;
      const utilization =
        usable != null && usable > 0 ? Math.round((usedHosts / usable) * 1000) / 10 : null;
      return {
        id: subnet.id,
        address: subnet.address,
        project: subnet.project,
        location: subnet.location,
        vlan: subnet.vlan,
        network: networkLabel,
        broadcast: broadcastLabel,
        rangeLabel: `${networkLabel} → ${broadcastLabel}`,
        totalIps: null,
        usableHosts: usable,
        usedHosts,
        reservedHosts,
        freeIps,
        utilizationPercent: utilization,
        status: subnet.status,
        address_family: 'ipv6',
      };
    }

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
      (h) => h.status !== 'free' && hostInSubnet(subnet, h),
    ).length;
    const reservedHosts = hosts.filter(
      (h) => h.status === 'reserved' && hostInSubnet(subnet, h),
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
      address_family: 'ipv4',
    };
  });
}

export function importVlsmPlan(plan, projectName = '', parentSubnetId = null) {
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
      parent_subnet_id: parentSubnetId,
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
  const hostnameIdx = col('hostname');
  const macIdx = col('mac_address');
  const gatewayIdx = col('gateway');
  const dhcpIdx = col('dhcp_scope');
  const ptrIdx = col('ptr_record');

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
      hostname: hostnameIdx >= 0 ? cells[hostnameIdx]?.trim() : null,
      mac_address: macIdx >= 0 ? cells[macIdx]?.trim() : null,
      gateway: gatewayIdx >= 0 ? cells[gatewayIdx]?.trim() : null,
      dhcp_scope: dhcpIdx >= 0 ? cells[dhcpIdx]?.trim() : null,
      ptr_record: ptrIdx >= 0 ? cells[ptrIdx]?.trim() : null,
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
    'Hostname',
    'MAC Address',
    'Gateway',
    'DHCP Scope',
    'PTR Record',
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
    r.hostname ?? '',
    r.mac_address ?? '',
    r.gateway ?? '',
    r.dhcp_scope ?? '',
    r.ptr_record ?? '',
    r.created_at ?? '',
    r.updated_at ?? '',
  ]);
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export function csvImportTemplate() {
  return recordsToCsv([]);
}
