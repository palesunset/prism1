/** Allocation efficiency: used hosts ÷ usable addresses within registered subnets (per family). */

function isIpv6DashboardRow(row) {
  return row?.address_family === 'ipv6' || String(row?.address ?? '').includes(':');
}

/** Usable host count for small IPv6 prefixes (/120–/128). Large blocks return null. */
export function v6UsableHostCount(subnet) {
  const prefix = subnet.cidr_prefix ?? 128;
  if (prefix < 120 || !subnet.v6_range_start || !subnet.v6_range_end) return null;
  try {
    const start = BigInt(`0x${String(subnet.v6_range_start).padStart(32, '0')}`);
    const end = BigInt(`0x${String(subnet.v6_range_end).padStart(32, '0')}`);
    const size = end - start + 1n;
    if (size <= 0n || size > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(size);
  } catch {
    return null;
  }
}

function metricsForRows(rows) {
  const applicable = rows.filter((s) => s.usableHosts != null && s.usableHosts > 0);
  const usedHosts = applicable.reduce((a, s) => a + (s.usedHosts ?? 0), 0);
  const usableHosts = applicable.reduce((a, s) => a + s.usableHosts, 0);
  const registeredHosts = rows.reduce((a, s) => a + (s.usedHosts ?? 0), 0);
  const subnetsWithHosts = rows.filter((s) => (s.usedHosts ?? 0) > 0).length;
  const percent =
    usableHosts > 0
      ? Math.round((usedHosts / usableHosts) * 1000) / 10
      : rows.length > 0
        ? 0
        : null;
  return {
    percent,
    usedHosts,
    usableHosts,
    registeredHosts,
    subnetsWithHosts,
    applicableSubnets: applicable.length,
    totalSubnets: rows.length,
  };
}

/**
 * @param {Array<{ address?: string, address_family?: string, usableHosts?: number|null, usedHosts?: number }>} dashboardRows
 */
export function computeAllocationEfficiency(dashboardRows) {
  const ipv4Rows = dashboardRows.filter((r) => !isIpv6DashboardRow(r));
  const ipv6Rows = dashboardRows.filter((r) => isIpv6DashboardRow(r));
  const ipv4 = metricsForRows(ipv4Rows);
  const ipv6 = metricsForRows(ipv6Rows);

  let efficiencyPercent = ipv4.percent;
  if (efficiencyPercent == null && ipv4.totalSubnets === 0 && ipv6.percent != null) {
    efficiencyPercent = ipv6.percent;
  }
  if (efficiencyPercent == null && ipv4.totalSubnets === 0 && ipv6.totalSubnets === 0) {
    efficiencyPercent = 100;
  }

  return {
    efficiencyPercent,
    efficiencyIpv4: ipv4,
    efficiencyIpv6: ipv6,
  };
}

export function efficiencySummaryLine(metrics, familyLabel) {
  if (metrics.totalSubnets === 0) {
    return `${familyLabel}: no subnets registered.`;
  }
  if (metrics.percent == null) {
    return `${familyLabel}: no measurable usable space in registered subnets.`;
  }
  const assigned = metrics.registeredHosts ?? metrics.usedHosts;
  const count = metrics.applicableSubnets > 0 ? metrics.applicableSubnets : metrics.totalSubnets;
  if (assigned === 0) {
    if (metrics.usableHosts > 0) {
      return `${familyLabel}: ${metrics.percent}% — no hosts assigned (${metrics.usableHosts} usable across ${count} subnet(s)).`;
    }
    return `${familyLabel}: ${metrics.percent}% — no hosts assigned across ${count} subnet(s).`;
  }
  if (metrics.usableHosts > 0) {
    return `${familyLabel}: ${metrics.percent}% (${assigned} used / ${metrics.usableHosts} usable across ${count} subnet(s)).`;
  }
  return `${familyLabel}: ${metrics.percent}% (${assigned} host(s) across ${count} subnet(s)).`;
}
