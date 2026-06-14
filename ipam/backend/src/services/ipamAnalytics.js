import { buildDashboard, detectConflicts, getRecord, listRecords } from './ipamService.js';
import { ipInRange, octetsToString, parseAddressInput, uint32ToIp } from '../lib/ipMath.js';
import { listAudit } from './ipamAudit.js';

export function validateRecordInput(body) {
  const recordType = body.record_type === 'host' ? 'host' : 'subnet';
  if (recordType === 'subnet' && !String(body.address ?? '').includes('/')) {
    return { valid: false, error: 'Subnet records must use CIDR notation (e.g. 10.1.1.0/24).' };
  }
  const parsed = parseAddressInput(body.address, recordType);
  if (parsed.error) return { valid: false, error: parsed.error };
  const conflicts = detectConflicts(parsed, body.exclude_id ?? null, {
    record_type: recordType,
    status: body.status,
  });
  const blocking = conflicts.filter((c) =>
    ['duplicate_host', 'duplicate_subnet', 'subnet_overlap', 'range_overlap'].includes(c.type),
  );
  return {
    valid: blocking.length === 0,
    parsed: {
      normalized: parsed.normalized,
      network: octetsToString(parsed.network),
      broadcast: octetsToString(parsed.broadcast),
      prefix: parsed.prefix,
      usableHosts: parsed.usableHosts,
      role: parsed.role,
    },
    conflicts,
    blocking,
  };
}

export function scanAllConflicts() {
  const records = listRecords();
  const issues = [];

  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const a = records[i];
      const b = records[j];
      if (a.record_type === 'subnet' && b.record_type === 'subnet') {
        const overlap =
          a.range_start <= b.range_end &&
          b.range_start <= a.range_end &&
          !(a.range_start === b.range_start && a.range_end === b.range_end);
        if (overlap) {
          issues.push({
            type: 'subnet_overlap',
            message: `Subnet ${a.address} overlaps with ${b.address}`,
            records: [a, b],
            suggestion: 'Consolidate or resize overlapping subnet definitions.',
          });
        }
      }
      if (a.record_type === 'host' && b.record_type === 'host' && a.range_start === b.range_start) {
        issues.push({
          type: 'duplicate_host',
          message: `Duplicate host ${a.address}`,
          records: [a, b],
          suggestion: 'Remove one assignment or merge project metadata.',
        });
      }
    }
  }
  return { scannedAt: new Date().toISOString(), count: issues.length, issues };
}

function usableBounds(subnet) {
  const total = subnet.range_end - subnet.range_start + 1;
  if (subnet.cidr_prefix === 32) {
    return { first: subnet.range_start, last: subnet.range_end };
  }
  if (subnet.cidr_prefix === 31) {
    return { first: subnet.range_start, last: subnet.range_end };
  }
  if (total <= 2) return { first: null, last: null };
  return { first: subnet.range_start + 1, last: subnet.range_end - 1 };
}

export function getSubnetDetail(id) {
  const subnet = getRecord(id);
  if (!subnet || subnet.record_type !== 'subnet') return { error: 'Subnet not found' };

  const all = listRecords();
  const hosts = all.filter(
    (r) => r.record_type === 'host' && ipInRange(r.range_start, subnet.range_start, subnet.range_end),
  );
  const childSubnets = all.filter(
    (r) =>
      r.id !== subnet.id &&
      r.record_type === 'subnet' &&
      r.range_start >= subnet.range_start &&
      r.range_end <= subnet.range_end,
  );
  const bounds = usableBounds(subnet);
  const freeRanges = computeFreeRanges(subnet, all);

  return {
    subnet,
    hosts,
    childSubnets,
    usableRange:
      bounds.first != null
        ? `${octetsToString(uint32ToIp(bounds.first))} – ${octetsToString(uint32ToIp(bounds.last))}`
        : null,
    freeRanges,
    nextSuggestedIp: suggestNextIpInSubnet(subnet, all),
  };
}

export function computeFreeRanges(subnet, allRecords = null) {
  const records = allRecords ?? listRecords();
  const bounds = usableBounds(subnet);
  if (bounds.first == null) return [];

  const occupied = records
    .filter(
      (r) =>
        r.id !== subnet.id &&
        ipInRange(r.range_start, subnet.range_start, subnet.range_end),
    )
    .map((r) => ({ start: r.range_start, end: r.range_end }))
    .sort((a, b) => a.start - b.start);

  const free = [];
  let cursor = bounds.first;
  for (const block of occupied) {
    if (block.start > cursor) {
      free.push({
        start: octetsToString(uint32ToIp(cursor)),
        end: octetsToString(uint32ToIp(Math.min(block.start - 1, bounds.last))),
        count: block.start - cursor,
      });
    }
    cursor = Math.max(cursor, block.end + 1);
  }
  if (cursor <= bounds.last) {
    free.push({
      start: octetsToString(uint32ToIp(cursor)),
      end: octetsToString(uint32ToIp(bounds.last)),
      count: bounds.last - cursor + 1,
    });
  }
  return free;
}

export function suggestNextIpInSubnet(subnet, allRecords = null) {
  const records = allRecords ?? listRecords();
  const bounds = usableBounds(subnet);
  if (bounds.first == null) return null;

  const used = new Set(
    records
      .filter((r) => r.record_type === 'host' && ipInRange(r.range_start, bounds.first, bounds.last))
      .map((r) => r.range_start),
  );

  for (let ip = bounds.first; ip <= bounds.last; ip += 1) {
    if (!used.has(ip)) return octetsToString(uint32ToIp(ip));
  }
  return null;
}

export function buildAnalytics() {
  const records = listRecords();
  const subnets = buildDashboard();
  const hosts = records.filter((r) => r.record_type === 'host');
  const subnetRecords = records.filter((r) => r.record_type === 'subnet');

  const byStatus = { free: 0, used: 0, reserved: 0 };
  for (const r of records) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  const projectMap = new Map();
  for (const r of records) {
    const key = r.project?.trim() || '(unassigned)';
    if (!projectMap.has(key)) projectMap.set(key, { project: key, records: 0, subnets: 0, hosts: 0 });
    const entry = projectMap.get(key);
    entry.records += 1;
    if (r.record_type === 'subnet') entry.subnets += 1;
    else entry.hosts += 1;
  }

  const utilizations = subnets.map((s) => s.utilizationPercent);
  const avgUtil =
    utilizations.length > 0
      ? Math.round((utilizations.reduce((a, b) => a + b, 0) / utilizations.length) * 10) / 10
      : 0;

  const conflictScan = scanAllConflicts();

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      records: records.length,
      hosts: hosts.length,
      subnets: subnetRecords.length,
      ...byStatus,
    },
    utilization: {
      averagePercent: avgUtil,
      subnetsOver80: subnets.filter((s) => s.utilizationPercent >= 80).length,
      subnetsUnder20: subnets.filter((s) => s.utilizationPercent < 20 && s.usableHosts > 0).length,
      highUtilizationSubnets: subnets.filter((s) => s.utilizationPercent >= 80).map((s) => s.address),
    },
    byProject: [...projectMap.values()].sort((a, b) => b.records - a.records),
    subnetSummaries: subnets,
    openConflicts: conflictScan.count,
    recentAudit: listAudit(15),
  };
}

export function buildUtilizationReport() {
  const analytics = buildAnalytics();
  const lines = [
    'PRISM Mini IPAM — Utilization Report',
    `Generated: ${analytics.generatedAt}`,
    '',
    `Total records: ${analytics.totals.records} (${analytics.totals.subnets} subnets, ${analytics.totals.hosts} hosts)`,
    `Status — used: ${analytics.totals.used}, reserved: ${analytics.totals.reserved}, free: ${analytics.totals.free}`,
    `Average subnet utilization: ${analytics.utilization.averagePercent}%`,
    `Subnets ≥80% utilized: ${analytics.utilization.subnetsOver80}`,
    `Open conflict pairs: ${analytics.openConflicts}`,
    '',
    'Per-subnet breakdown:',
  ];
  for (const s of analytics.subnetSummaries) {
    lines.push(
      `  ${s.address} | ${s.project || '—'} | used ${s.usedHosts}/${s.usableHosts} (${s.utilizationPercent}%) | free ${s.freeIps}`,
    );
  }
  return { text: lines.join('\n'), analytics };
}

export function getCapabilities() {
  return {
    product: 'PRISM Mini IPAM',
    apiVersion: '1.0',
    phases: {
      1: {
        name: 'Basic IP database',
        status: 'complete',
        features: ['IP/subnet registry', 'Search', 'IPv4 validation', 'Pre-save validate'],
      },
      2: {
        name: 'VLSM & conflict prevention',
        status: 'complete',
        features: ['VLSM JSON import', 'Overlap detection', 'Subnet tracking', 'Free-space finder'],
      },
      3: {
        name: 'Analytics & reporting',
        status: 'complete',
        features: ['Utilization dashboard', 'Project breakdown', 'Utilization report', 'CSV/JSON export'],
      },
      4: {
        name: 'Enterprise foundation',
        status: 'complete',
        features: ['Audit log', 'Bulk CSV import', 'Next-IP suggestion', 'REST API manifest', 'Conflict audit scan'],
      },
      5: {
        name: 'IP Workflow Manager',
        status: 'complete',
        features: [
          'Allocation lifecycle state machine',
          'NetLens validation attachment',
          'Approval / reject / override',
          'Registry write on approve/reserve/activate',
          'Full workflow change log',
        ],
      },
    },
    endpoints: [
      'GET /api/ipam/workflow',
      'GET /api/ipam/workflow/dashboard',
      'POST /api/ipam/workflow',
      'POST /api/ipam/workflow/:id/netlens',
      'POST /api/ipam/workflow/:id/action',
      'GET /api/ipam/workflow/:id',
      'GET /api/ipam/workflow/history',
      'GET /api/ipam/records',
      'POST /api/ipam/records',
      'POST /api/ipam/validate',
      'POST /api/ipam/search',
      'GET /api/ipam/dashboard',
      'GET /api/ipam/analytics',
      'GET /api/ipam/reports/utilization',
      'GET /api/ipam/conflicts/scan',
      'GET /api/ipam/subnets/:id',
      'GET /api/ipam/subnets/:id/next-ip',
      'POST /api/ipam/import/vlsm',
      'POST /api/ipam/import/csv',
      'GET /api/ipam/audit',
      'GET /api/ipam/capabilities',
      'GET /api/ipam/export/json',
      'GET /api/ipam/export/csv',
    ],
  };
}
