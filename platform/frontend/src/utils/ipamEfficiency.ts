import type { IpamEfficiencyMetrics, SubnetDashboard } from '../services/ipamApi';
import type { IpAddressFamily } from './ipamFamily';

function assignedHostCount(metrics: IpamEfficiencyMetrics): number {
  return metrics.registeredHosts ?? metrics.usedHosts;
}

function subnetCount(metrics: IpamEfficiencyMetrics): number {
  return metrics.applicableSubnets > 0 ? metrics.applicableSubnets : metrics.totalSubnets;
}

function formatEfficiencyDetail(metrics: IpamEfficiencyMetrics): string {
  const assigned = assignedHostCount(metrics);
  const count = subnetCount(metrics);
  if (assigned === 0) {
    if (metrics.usableHosts > 0) {
      return `No hosts assigned yet — ${metrics.usableHosts.toLocaleString()} usable address(es) available across ${count} subnet(s).`;
    }
    return `No hosts assigned yet — usable address(es) not measured across ${count} subnet(s).`;
  }
  if (metrics.usableHosts > 0) {
    return `${assigned} host(s) assigned of ${metrics.usableHosts.toLocaleString()} usable address(es) across ${count} subnet(s).`;
  }
  return `${assigned} host(s) assigned of — usable address(es) across ${count} subnet(s).`;
}

export function formatAllocationEfficiency(
  metrics: IpamEfficiencyMetrics | undefined,
  _family: IpAddressFamily,
): { value: string; detail: string } {
  if (!metrics) {
    return { value: '—', detail: 'No efficiency data.' };
  }

  if (metrics.totalSubnets === 0) {
    return { value: 'N/A', detail: 'No subnets registered.' };
  }

  if (metrics.percent == null) {
    return { value: 'N/A', detail: 'No usable address space to measure.' };
  }

  return {
    value: `${metrics.percent}%`,
    detail: formatEfficiencyDetail(metrics),
  };
}

export function formatUtilizationAverage(
  subnets: SubnetDashboard[],
  _family: IpAddressFamily,
): { value: string; detail: string } {
  if (subnets.length === 0) {
    return { value: '—', detail: 'No subnets registered.' };
  }

  const measurable = subnets.filter((s) => s.utilizationPercent != null);
  if (measurable.length === 0) {
    return { value: 'N/A', detail: 'No measurable utilization across registered subnets.' };
  }

  const avg =
    Math.round(
      (measurable.reduce((a, s) => a + (s.utilizationPercent ?? 0), 0) / measurable.length) * 10,
    ) / 10;
  const totalUsed = measurable.reduce((a, s) => a + (s.usedHosts ?? 0), 0);

  if (avg === 0 && totalUsed === 0) {
    return {
      value: '0%',
      detail: `All ${measurable.length} subnet(s) are empty — no host assignments registered yet.`,
    };
  }

  return {
    value: `${avg}%`,
    detail: `Mean of per-subnet utilization across ${measurable.length} subnet(s).`,
  };
}

export function efficiencyMetricsForFamily(
  summary: { efficiencyIpv4?: IpamEfficiencyMetrics; efficiencyIpv6?: IpamEfficiencyMetrics; efficiencyPercent?: number | null },
  family: IpAddressFamily,
): IpamEfficiencyMetrics | undefined {
  return family === 'ipv6' ? summary.efficiencyIpv6 : summary.efficiencyIpv4;
}
