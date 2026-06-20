import type { IpamRecord, SubnetDashboard } from '../services/ipamApi';

export type IpAddressFamily = 'ipv4' | 'ipv6';

export function detectAddressFamily(address: string): IpAddressFamily {
  return String(address ?? '').includes(':') ? 'ipv6' : 'ipv4';
}

export function recordAddressFamily(record: IpamRecord): IpAddressFamily {
  if (record.address_family === 'ipv6') return 'ipv6';
  if (record.address_family === 'ipv4') return 'ipv4';
  return detectAddressFamily(record.address);
}

export function filterRecordsByFamily(records: IpamRecord[], family: IpAddressFamily): IpamRecord[] {
  return records.filter((r) => recordAddressFamily(r) === family);
}

export function filterDashboardByFamily(subnets: SubnetDashboard[], family: IpAddressFamily): SubnetDashboard[] {
  return subnets.filter((s) => {
    const rowFamily = (s as SubnetDashboard & { address_family?: string }).address_family;
    if (rowFamily === 'ipv6' || rowFamily === 'ipv4') return rowFamily === family;
    return detectAddressFamily(s.address) === family;
  });
}

export function familyTotals(records: IpamRecord[], family: IpAddressFamily) {
  const scoped = filterRecordsByFamily(records, family);
  const subnets = scoped.filter((r) => r.record_type === 'subnet');
  const hosts = scoped.filter((r) => r.record_type === 'host');
  return {
    records: scoped.length,
    subnets: subnets.length,
    hosts: hosts.length,
    used: scoped.filter((r) => r.status === 'used').length,
    reserved: scoped.filter((r) => r.status === 'reserved').length,
    free: scoped.filter((r) => r.status === 'free').length,
  };
}

export function hostInSubnetRecord(host: IpamRecord, subnet: IpamRecord): boolean {
  if (recordAddressFamily(host) !== recordAddressFamily(subnet)) return false;
  if (recordAddressFamily(subnet) === 'ipv6') {
    if (!host.v6_range_start || !subnet.v6_range_start || !subnet.v6_range_end) return false;
    return host.v6_range_start >= subnet.v6_range_start && host.v6_range_end <= subnet.v6_range_end;
  }
  return host.range_start >= subnet.range_start && host.range_start <= subnet.range_end;
}

export function workflowAddressFamily(address: string): IpAddressFamily {
  return detectAddressFamily(address);
}

export function sortRecordsByAddress(a: IpamRecord, b: IpamRecord): number {
  if (recordAddressFamily(a) === 'ipv6') {
    return a.address.localeCompare(b.address);
  }
  return a.range_start - b.range_start || a.address.localeCompare(b.address);
}
