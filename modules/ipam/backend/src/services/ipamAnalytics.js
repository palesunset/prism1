import { buildDashboard, getRecord, listRecords } from './ipamService.js';
import { ipInRange, octetsToString, rangesOverlap, uint32ToIp } from '../lib/ipMath.js';
import { v6ContainsRange, v6HexToDisplay, v6RangesOverlap } from '../lib/ipMathV6.js';
import { hostInSubnet, rangesOverlapRecords, recordFamily } from '../lib/ipRangeHelpers.js';
import { listAudit } from './ipamAudit.js';
import { getUtilizationAlertPercent } from './ipamSettings.js';

export function scanAllConflicts(recordsInput = null) {
  const records = recordsInput ?? listRecords();
  const issues = [];
  const hostByKey = new Map();

  for (const h of records) {
    if (h.record_type !== 'host') continue;
    const key =
      recordFamily(h) === 'ipv6'
        ? `v6:${h.v6_range_start}:${h.v6_range_end}`
        : `v4:${h.range_start}`;
    if (hostByKey.has(key)) {
      const other = hostByKey.get(key);
      issues.push({
        type: 'duplicate_host',
        message: `Duplicate host ${h.address}`,
        records: [h, other],
        suggestion: 'Remove one assignment or merge project metadata.',
      });
    } else {
      hostByKey.set(key, h);
    }
  }

  const subnets = records.filter((r) => r.record_type === 'subnet');
  for (let i = 0; i < subnets.length; i += 1) {
    const a = subnets[i];
    for (let j = i + 1; j < subnets.length; j += 1) {
      const b = subnets[j];
      if (recordFamily(a) !== recordFamily(b)) continue;
      if (rangesOverlapRecords(a, b) && !sameSubnetBoundsRecord(a, b)) {
        issues.push({
          type: 'subnet_overlap',
          message: `Subnet ${a.address} overlaps with ${b.address}`,
          records: [a, b],
          suggestion: 'Consolidate or resize overlapping subnet definitions.',
        });
      }
    }
  }

  return { scannedAt: new Date().toISOString(), count: issues.length, issues };
}

function sameSubnetBoundsRecord(a, b) {
  if (recordFamily(a) === 'ipv6') {
    return a.v6_range_start === b.v6_range_start && a.v6_range_end === b.v6_range_end;
  }
  return a.range_start === b.range_start && a.range_end === b.range_end;
}

function usableBounds(subnet) {
  if (recordFamily(subnet) === 'ipv6') {
    if (!subnet.v6_range_start || !subnet.v6_range_end) {
      return { first: null, last: null, family: 'ipv6' };
    }
    return { first: subnet.v6_range_start, last: subnet.v6_range_end, family: 'ipv6' };
  }

  const total = subnet.range_end - subnet.range_start + 1;
  if (subnet.cidr_prefix === 32) {
    return { first: subnet.range_start, last: subnet.range_end, family: 'ipv4' };
  }
  if (subnet.cidr_prefix === 31) {
    return { first: subnet.range_start, last: subnet.range_end, family: 'ipv4' };
  }
  if (total <= 2) return { first: null, last: null, family: 'ipv4' };
  return { first: subnet.range_start + 1, last: subnet.range_end - 1, family: 'ipv4' };
}

function incrementV6Hex(hex) {
  let n = BigInt(`0x${hex}`);
  n += 1n;
  return n.toString(16).padStart(32, '0');
}

export function getSubnetDetail(id) {
  const subnet = getRecord(id);
  if (!subnet || subnet.record_type !== 'subnet') return { error: 'Subnet not found' };

  const all = listRecords();
  const hosts = all.filter((r) => r.record_type === 'host' && hostInSubnet(subnet, r));
  const childSubnets = all.filter((r) => {
    if (r.id === subnet.id || r.record_type !== 'subnet') return false;
    if (recordFamily(r) !== recordFamily(subnet)) return false;
    const inside =
      recordFamily(subnet) === 'ipv6'
        ? v6ContainsRange(subnet.v6_range_start, subnet.v6_range_end, r.v6_range_start, r.v6_range_end)
        : r.range_start >= subnet.range_start && r.range_end <= subnet.range_end;
    return inside && (r.parent_subnet_id === subnet.id || !r.parent_subnet_id);
  });
  const bounds = usableBounds(subnet);
  const freeRanges = computeFreeRanges(subnet, all);

  let usableRange = null;
  if (bounds.first != null) {
    usableRange =
      bounds.family === 'ipv6'
        ? `${v6HexToDisplay(bounds.first)} – ${v6HexToDisplay(bounds.last)}`
        : `${octetsToString(uint32ToIp(bounds.first))} – ${octetsToString(uint32ToIp(bounds.last))}`;
  }

  return {
    subnet,
    hosts,
    childSubnets,
    usableRange,
    freeRanges,
    nextSuggestedIp: suggestNextIpInSubnet(subnet, all),
  };
}

export function computeFreeRanges(subnet, allRecords = null) {
  const records = allRecords ?? listRecords();
  const bounds = usableBounds(subnet);
  if (bounds.first == null) return [];

  if (bounds.family === 'ipv6') {
    const occupied = records
      .filter(
        (r) =>
          r.id !== subnet.id &&
          recordFamily(r) === 'ipv6' &&
          r.v6_range_start &&
          v6RangesOverlap(r.v6_range_start, r.v6_range_end, bounds.first, bounds.last),
      )
      .map((r) => ({
        start: r.v6_range_start > bounds.first ? r.v6_range_start : bounds.first,
        end: r.v6_range_end < bounds.last ? r.v6_range_end : bounds.last,
      }))
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

    const free = [];
    let cursor = bounds.first;
    for (const block of occupied) {
      if (block.start > cursor) {
        const gapEnd = decrementV6Hex(block.start);
        free.push({
          start: v6HexToDisplay(cursor),
          end: v6HexToDisplay(gapEnd),
          count: v6RangeCount(cursor, gapEnd),
        });
      }
      cursor = block.end > cursor ? incrementV6Hex(block.end) : cursor;
    }
    if (cursor <= bounds.last) {
      free.push({
        start: v6HexToDisplay(cursor),
        end: v6HexToDisplay(bounds.last),
        count: v6RangeCount(cursor, bounds.last),
      });
    }
    return free;
  }

  const occupied = records
    .filter(
      (r) =>
        r.id !== subnet.id &&
        recordFamily(r) === 'ipv4' &&
        rangesOverlap(r.range_start, r.range_end, bounds.first, bounds.last),
    )
    .map((r) => ({
      start: Math.max(r.range_start, bounds.first),
      end: Math.min(r.range_end, bounds.last),
    }))
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

function decrementV6Hex(hex) {
  let n = BigInt(`0x${hex}`);
  n -= 1n;
  return n.toString(16).padStart(32, '0');
}

function v6RangeCount(startHex, endHex) {
  try {
    const a = BigInt(`0x${String(startHex).padStart(32, '0')}`);
    const b = BigInt(`0x${String(endHex).padStart(32, '0')}`);
    const size = b - a + 1n;
    if (size <= 0n || size > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(size);
  } catch {
    return null;
  }
}

function suggestNextIpv6InSubnet(subnet, records) {
  const bounds = usableBounds(subnet);
  if (!bounds.first || !bounds.last) return null;

  const start = BigInt(`0x${String(bounds.first).padStart(32, '0')}`);
  const end = BigInt(`0x${String(bounds.last).padStart(32, '0')}`);
  const occupied = records
    .filter((r) => r.record_type === 'host' && hostInSubnet(subnet, r))
    .map((r) => BigInt(`0x${String(r.v6_range_start).padStart(32, '0')}`))
    .filter((n) => n >= start && n <= end)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let cursor = start;
  for (const occ of occupied) {
    if (occ > cursor) {
      return v6HexToDisplay(cursor.toString(16).padStart(32, '0'));
    }
    if (occ >= cursor) cursor = occ + 1n;
  }
  if (cursor <= end) {
    return v6HexToDisplay(cursor.toString(16).padStart(32, '0'));
  }
  return null;
}

export function suggestNextIpInSubnet(subnet, allRecords = null) {
  const records = allRecords ?? listRecords();
  if (recordFamily(subnet) === 'ipv6') {
    return suggestNextIpv6InSubnet(subnet, records);
  }

  const freeRanges = computeFreeRanges(subnet, records);
  if (freeRanges.length === 0) return null;
  return freeRanges[0].start;
}

export function buildAnalytics(options = {}) {
  const includeConflictScan = Boolean(options.includeConflictScan);
  const records = options.records ?? listRecords();
  const subnets = options.dashboard ?? buildDashboard(records);
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

  const ipv4Subnets = subnets.filter((s) => s.address_family === 'ipv4' && s.utilizationPercent != null);
  const ipv6Subnets = subnets.filter((s) => s.address_family === 'ipv6' && s.utilizationPercent != null);
  const utilizations = ipv4Subnets.map((s) => s.utilizationPercent);
  const avgUtil =
    utilizations.length > 0
      ? Math.round((utilizations.reduce((a, b) => a + b, 0) / utilizations.length) * 10) / 10
      : 0;
  const v6Utilizations = ipv6Subnets.map((s) => s.utilizationPercent);
  const avgUtilV6 =
    v6Utilizations.length > 0
      ? Math.round((v6Utilizations.reduce((a, b) => a + b, 0) / v6Utilizations.length) * 10) / 10
      : null;

  const conflictScan = includeConflictScan
    ? scanAllConflicts(records)
    : { scannedAt: new Date().toISOString(), count: 0, issues: [] };
  const alertPercent = getUtilizationAlertPercent();

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
      averagePercentIpv6: avgUtilV6,
      alertPercent,
      subnetsOver80: ipv4Subnets.filter((s) => s.utilizationPercent >= alertPercent).length,
      subnetsOver80Ipv6: ipv6Subnets.filter((s) => s.utilizationPercent >= alertPercent).length,
      subnetsUnder20: ipv4Subnets.filter((s) => s.utilizationPercent < 20 && s.usableHosts > 0).length,
      highUtilizationSubnets: ipv4Subnets
        .filter((s) => s.utilizationPercent >= alertPercent)
        .map((s) => s.address),
      highUtilizationSubnetsIpv6: ipv6Subnets
        .filter((s) => s.utilizationPercent >= alertPercent)
        .map((s) => s.address),
    },
    byProject: [...projectMap.values()].sort((a, b) => b.records - a.records),
    subnetSummaries: subnets,
    openConflicts: conflictScan.count,
    recentAudit: listAudit(15),
  };
}

export function buildUtilizationReport() {
  const analytics = buildAnalytics({ includeConflictScan: true });
  const lines = [
    'PRISM Mini IPAM — Utilization Report',
    `Generated: ${analytics.generatedAt}`,
    '',
    `Total records: ${analytics.totals.records} (${analytics.totals.subnets} subnets, ${analytics.totals.hosts} hosts)`,
    `Status — used: ${analytics.totals.used}, reserved: ${analytics.totals.reserved}, free: ${analytics.totals.free}`,
    `Average subnet utilization (IPv4): ${analytics.utilization.averagePercent}%`,
    `Subnets ≥${analytics.utilization.alertPercent}% utilized: ${analytics.utilization.subnetsOver80}`,
    `Open conflict pairs: ${analytics.openConflicts}`,
    '',
    'Per-subnet breakdown:',
  ];
  for (const s of analytics.subnetSummaries) {
    const util =
      s.utilizationPercent != null
        ? `used ${s.usedHosts}/${s.usableHosts} (${s.utilizationPercent}%) | free ${s.freeIps}`
        : `hosts registered: ${s.usedHosts} (IPv6 — utilization N/A)`;
    lines.push(`  ${s.address} | ${s.project || '—'} | ${util}`);
  }
  return { text: lines.join('\n'), analytics };
}

export function getCapabilities() {
  return {
    product: 'PRISM Mini IPAM',
    apiVersion: '1.3',
    ipv6: true,
    inventoryCrossCheck: true,
    phases: {
      1: {
        name: 'Basic IP database',
        status: 'complete',
        features: [
          'IP/subnet registry',
          'Search',
          'IPv4 + IPv6 validation',
          'Pre-save validate',
          'Pagination',
          'Extended host metadata',
        ],
      },
      2: {
        name: 'VLSM & conflict prevention',
        status: 'complete',
        features: ['VLSM JSON import', 'Overlap detection', 'Subnet hierarchy', 'Free-space finder', 'Optimized conflict scan'],
      },
      3: {
        name: 'Analytics & reporting',
        status: 'complete',
        features: ['Utilization dashboard', 'Configurable alert threshold', 'Project breakdown', 'Utilization report', 'CSV/JSON export'],
      },
      4: {
        name: 'Enterprise foundation',
        status: 'complete',
        features: ['Audit log', 'Unified audit export', 'Bulk CSV import', 'Backup/restore', 'API key auth', 'Subnet cascade delete'],
      },
      5: {
        name: 'IP Workflow Manager',
        status: 'complete',
        features: [
          'Allocation lifecycle state machine',
          'NetLens validation attachment',
          'Approval / reject / override',
          'Registry write on reserve/activate only',
          'REJECTED terminal state',
          'Admin key for sensitive actions',
        ],
      },
      6: {
        name: 'Integration & scale',
        status: 'complete',
        features: ['Inventory cross-check', 'IPv6 registry & search', 'Frontend code splitting'],
      },
    },
    endpoints: [
      'GET /api/ipam/health',
      'GET /api/ipam/capabilities',
      'GET /api/ipam/picklists',
      'GET /api/ipam/settings',
      'PUT /api/ipam/settings',
      'GET /api/ipam/backup',
      'POST /api/ipam/restore',
      'POST /api/ipam/backup/db',
      'GET /api/ipam/audit/export.csv',
      'GET /api/ipam/import/csv/template',
      'POST /api/ipam/records/bulk-status',
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
      'GET /api/ipam/crosscheck/inventory',
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
      'GET /api/ipam/export/json',
      'GET /api/ipam/export/csv',
    ],
  };
}
