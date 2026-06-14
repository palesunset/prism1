import { logAudit } from './ipamAudit.js';
import { computeFreeRanges, scanAllConflicts } from './ipamAnalytics.js';
import { buildDashboard, detectConflicts, listRecords } from './ipamService.js';
import { ipInRange, octetsToString, parseAddressInput, rangesOverlap, uint32ToIp } from '../lib/ipMath.js';

const BLOCKING_TYPES = new Set([
  'duplicate_host',
  'duplicate_subnet',
  'subnet_overlap',
  'range_overlap',
  'invalid_cidr',
  'network_address',
  'broadcast_address',
]);

function findContainingSubnet(record, subnets) {
  const matches = subnets.filter(
    (s) => record.range_start >= s.range_start && record.range_start <= s.range_end,
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, s) => ((s.cidr_prefix ?? 0) > (best.cidr_prefix ?? 0) ? s : best));
}

function addRecordIssue(map, recordId, severity, type, message) {
  if (!map.has(recordId)) {
    map.set(recordId, { status: 'valid', issues: [] });
  }
  const entry = map.get(recordId);
  entry.issues.push({ severity, type, message });
  if (severity === 'conflict') entry.status = 'conflict';
  else if (severity === 'warning' && entry.status !== 'conflict') entry.status = 'warning';
}

export function checkHostAssignment(parsed, records = null) {
  if (parsed.recordType !== 'host' && parsed.role !== 'host') return null;
  const all = records ?? listRecords();
  const subnets = all.filter((r) => r.record_type === 'subnet');
  const parent = findContainingSubnet({ range_start: parsed.rangeStart, range_end: parsed.rangeEnd }, subnets);

  if (parent) {
    if (parsed.rangeStart === parent.range_start && (parent.cidr_prefix ?? 32) < 31) {
      return {
        type: 'network_address',
        message: `${parsed.normalized} is the network address of subnet ${parent.address} and cannot be assigned to a host.`,
        suggestion: 'Use the first usable host address in this subnet.',
      };
    }
    if (parsed.rangeStart === parent.range_end && (parent.cidr_prefix ?? 32) < 31) {
      return {
        type: 'broadcast_address',
        message: `${parsed.normalized} is the broadcast address of subnet ${parent.address} and cannot be assigned to a host.`,
        suggestion: 'Use a usable host address below the broadcast.',
      };
    }
  }

  return null;
}

export function validateBeforeSave(body, excludeId = null) {
  const recordType = body.record_type === 'host' ? 'host' : 'subnet';
  if (recordType === 'subnet' && !String(body.address ?? '').includes('/')) {
    return {
      allowed: false,
      outcome: 'block',
      error: 'Subnet records must use CIDR notation (e.g. 10.1.1.0/24).',
      conflicts: [{ type: 'invalid_cidr', message: 'Subnet records must use CIDR notation.' }],
      warnings: [],
    };
  }

  const parsed = parseAddressInput(body.address, recordType);
  if (parsed.error) {
    return {
      allowed: false,
      outcome: 'block',
      error: parsed.error,
      conflicts: [{ type: 'invalid_cidr', message: parsed.error }],
      warnings: [],
    };
  }

  const conflicts = detectConflicts(parsed, excludeId, { record_type: recordType, status: body.status });
  const blocking = conflicts.filter((c) => BLOCKING_TYPES.has(c.type));

  const hostRole = recordType === 'host' ? checkHostAssignment(parsed) : null;
  if (hostRole) {
    blocking.push(hostRole);
  }

  const warnings = [];
  if (recordType === 'host' && !String(body.project ?? '').trim() && body.status !== 'reserved') {
    warnings.push({
      type: 'no_project',
      message: 'Host has no project assigned.',
      suggestion: 'Assign a project or mark as reserved.',
    });
  }
  if (recordType === 'subnet' && !String(body.project ?? '').trim() && body.status !== 'reserved') {
    warnings.push({
      type: 'no_project',
      message: 'Subnet has no project assigned.',
      suggestion: 'Assign a project or mark as reserved.',
    });
  }

  const all = listRecords().filter((r) => r.id !== excludeId);
  if (recordType === 'host') {
    const subnets = all.filter((r) => r.record_type === 'subnet');
    const parent = findContainingSubnet({ range_start: parsed.rangeStart }, subnets);
    if (!parent) {
      warnings.push({
        type: 'orphan_host',
        message: `${parsed.normalized} is not inside any registered subnet.`,
        suggestion: 'Register the parent subnet first or verify the address.',
      });
    }
  }

  const allowWithWarnings = body.allow_warnings === true;
  if (blocking.length > 0) {
    return {
      allowed: false,
      outcome: 'block',
      error: blocking[0].message,
      parsed: { normalized: parsed.normalized, role: parsed.role },
      conflicts: blocking,
      warnings,
    };
  }

  return {
    allowed: true,
    outcome: warnings.length > 0 && !allowWithWarnings ? 'warn' : 'allow',
    parsed: {
      normalized: parsed.normalized,
      network: octetsToString(parsed.network),
      broadcast: octetsToString(parsed.broadcast),
      prefix: parsed.prefix,
      role: parsed.role,
    },
    conflicts: [],
    warnings,
  };
}

function simulateAgainstBatch(parsed, recordType, batchEntries) {
  const issues = [];
  for (const entry of batchEntries) {
    if (entry.record_type === 'subnet' && recordType === 'subnet') {
      if (entry.range_start === parsed.rangeStart && entry.range_end === parsed.rangeEnd) {
        issues.push({
          type: 'duplicate_subnet',
          message: `Duplicate subnet ${parsed.normalized} within batch.`,
        });
      } else if (rangesOverlap(entry.range_start, entry.range_end, parsed.rangeStart, parsed.rangeEnd)) {
        issues.push({
          type: 'subnet_overlap',
          message: `Subnet ${parsed.normalized} overlaps with ${entry.address} in batch.`,
        });
      }
    }
  }
  return issues;
}

export function simulateRecord(body, excludeId = null) {
  return validateBeforeSave(body, excludeId);
}

export function simulateVlsmImport(plan, projectName = '') {
  if (!plan?.subnets?.length) {
    return { error: 'No subnets found in VLSM plan.' };
  }
  const project = projectName || plan.baseNetwork || 'VLSM Import';
  const safe = [];
  const skipped = [];
  const batch = [];

  for (const s of plan.subnets) {
    const cidr = s.cidr ?? `${s.network}/${s.prefix}`;
    const address = cidr.includes('/') ? cidr : `${s.network}/${s.prefix}`;
    const parsed = parseAddressInput(address, 'subnet');
    if (parsed.error) {
      skipped.push({ address, reasons: [parsed.error] });
      continue;
    }
    const check = validateBeforeSave({
      address,
      record_type: 'subnet',
      status: 'reserved',
      project,
    });
    const batchIssues = simulateAgainstBatch(parsed, 'subnet', batch);
    const blocking = [...(check.conflicts ?? []), ...batchIssues];
    if (!check.allowed || batchIssues.length > 0) {
      skipped.push({
        address,
        reasons: blocking.map((c) => c.message),
      });
    } else {
      safe.push({ address, warnings: check.warnings ?? [] });
      batch.push({
        address: parsed.normalized,
        record_type: 'subnet',
        range_start: parsed.rangeStart,
        range_end: parsed.rangeEnd,
      });
    }
  }

  return {
    simulatedAt: new Date().toISOString(),
    project,
    summary: {
      total: plan.subnets.length,
      safe: safe.length,
      skipped: skipped.length,
    },
    safe,
    skipped,
  };
}

export function buildIntegrityAudit() {
  const records = listRecords();
  const subnets = records.filter((r) => r.record_type === 'subnet');
  const hosts = records.filter((r) => r.record_type === 'host');
  const dashboard = buildDashboard();
  const conflictScan = scanAllConflicts();
  const recordStatus = new Map();
  const conflicts = [];
  const warnings = [];

  for (const issue of conflictScan.issues) {
    conflicts.push({
      severity: 'conflict',
      type: issue.type,
      message: issue.message,
      suggestion: issue.suggestion ?? null,
      recordIds: issue.records.map((r) => r.id),
      addresses: issue.records.map((r) => r.address),
    });
    for (const r of issue.records) {
      addRecordIssue(recordStatus, r.id, 'conflict', issue.type, issue.message);
    }
  }

  for (const host of hosts) {
    const parent = findContainingSubnet(host, subnets);
    if (!parent) {
      const msg = `${host.address} is not inside any registered subnet (orphan host).`;
      warnings.push({ type: 'orphan_host', message: msg, recordId: host.id, address: host.address });
      addRecordIssue(recordStatus, host.id, 'warning', 'orphan_host', msg);
    } else {
      if (host.range_start === parent.range_start && (parent.cidr_prefix ?? 32) < 31) {
        const msg = `${host.address} is assigned to the network address of ${parent.address}.`;
        conflicts.push({
          severity: 'conflict',
          type: 'network_address',
          message: msg,
          recordIds: [host.id, parent.id],
          addresses: [host.address, parent.address],
        });
        addRecordIssue(recordStatus, host.id, 'conflict', 'network_address', msg);
      }
      if (host.range_start === parent.range_end && (parent.cidr_prefix ?? 32) < 31) {
        const msg = `${host.address} is assigned to the broadcast address of ${parent.address}.`;
        conflicts.push({
          severity: 'conflict',
          type: 'broadcast_address',
          message: msg,
          recordIds: [host.id, parent.id],
          addresses: [host.address, parent.address],
        });
        addRecordIssue(recordStatus, host.id, 'conflict', 'broadcast_address', msg);
      }
    }

    if (!host.project?.trim() && host.status !== 'reserved') {
      const msg = `${host.address} has no project assigned.`;
      warnings.push({ type: 'no_project', message: msg, recordId: host.id, address: host.address });
      addRecordIssue(recordStatus, host.id, 'warning', 'no_project', msg);
    }
  }

  for (const subnet of subnets) {
    if (!subnet.project?.trim() && subnet.status !== 'reserved') {
      const msg = `Subnet ${subnet.address} has no project assigned.`;
      warnings.push({ type: 'no_project', message: msg, recordId: subnet.id, address: subnet.address });
      addRecordIssue(recordStatus, subnet.id, 'warning', 'no_project', msg);
    }

    const dash = dashboard.find((d) => d.id === subnet.id);
    if (dash && dash.usedHosts === 0 && dash.utilizationPercent === 0 && subnet.status === 'used') {
      const msg = `Subnet ${subnet.address} is marked used but has no host assignments.`;
      warnings.push({ type: 'unused_subnet', message: msg, recordId: subnet.id, address: subnet.address });
      addRecordIssue(recordStatus, subnet.id, 'warning', 'unused_subnet', msg);
    }

    const freeRanges = computeFreeRanges(subnet, records);
    if (freeRanges.length > 3 && dash && dash.usedHosts > 0) {
      const msg = `Subnet ${subnet.address} has fragmented free space (${freeRanges.length} blocks).`;
      warnings.push({ type: 'fragmentation', message: msg, recordId: subnet.id, address: subnet.address });
      addRecordIssue(recordStatus, subnet.id, 'warning', 'fragmentation', msg);
    }
  }

  let conflictCount = 0;
  let warningCount = 0;
  let validCount = 0;
  for (const r of records) {
    const st = recordStatus.get(r.id)?.status ?? 'valid';
    if (st === 'conflict') conflictCount += 1;
    else if (st === 'warning') warningCount += 1;
    else validCount += 1;
  }

  const healthScore =
    records.length === 0
      ? 100
      : Math.max(0, Math.round(((validCount + warningCount * 0.5) / records.length) * 100));

  const totalAllocated = dashboard.reduce((a, s) => a + s.usedHosts, 0);
  const totalUsable = dashboard.reduce((a, s) => a + s.usableHosts, 0);
  const efficiencyPercent =
    totalUsable > 0 ? Math.round((totalAllocated / totalUsable) * 1000) / 10 : 100;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: records.length,
      subnets: subnets.length,
      hosts: hosts.length,
      valid: validCount,
      conflicts: conflictCount,
      warnings: warningCount,
      healthScore,
      efficiencyPercent,
      openConflictPairs: conflictScan.count,
    },
    conflicts,
    warnings,
    recordStatus: Object.fromEntries(
      [...recordStatus.entries()].map(([id, v]) => [id, v]),
    ),
  };
}

export function buildIntegrityReport() {
  const audit = buildIntegrityAudit();
  const lines = [
    'PRISM Mini IPAM — Integrity Audit Report',
    `Generated: ${audit.generatedAt}`,
    '',
    `Total entries: ${audit.summary.total}`,
    `✔ Valid: ${audit.summary.valid}`,
    `❌ Conflicts: ${audit.summary.conflicts}`,
    `⚠ Warnings: ${audit.summary.warnings}`,
    `📊 Health score: ${audit.summary.healthScore}%`,
    `📊 Allocation efficiency: ${audit.summary.efficiencyPercent}%`,
    '',
    'Conflicts:',
  ];
  if (audit.conflicts.length === 0) lines.push('  (none)');
  for (const c of audit.conflicts) {
    lines.push(`  ❌ ${c.message}`);
  }
  lines.push('', 'Warnings:');
  if (audit.warnings.length === 0) lines.push('  (none)');
  for (const w of audit.warnings) {
    lines.push(`  ⚠ ${w.message}`);
  }
  return { text: lines.join('\n'), audit };
}

export function runPostSaveIntegrityScan(action, recordId, address) {
  const audit = buildIntegrityAudit();
  logAudit('integrity_scan', recordId, address, {
    action,
    healthScore: audit.summary.healthScore,
    conflicts: audit.summary.conflicts,
    warnings: audit.summary.warnings,
  });
  return audit.summary;
}
