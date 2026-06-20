import type { IpamRecord, SubnetDashboard } from '../services/ipamApi';
import type { IpOctets } from './ipCalculator';
import { parseIpPart } from './ipCalculator';
import { hostInSubnetRecord } from './ipamFamily';

export type IpAddressScope = 'private' | 'public';

function octetsPrivate(o: IpOctets): boolean {
  if (o[0] === 10) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  return false;
}

/** RFC1918 private vs globally routable (public) space. */
export function ipAddressScope(address: string): IpAddressScope {
  const base = address.trim().split('/')[0]?.trim() ?? '';
  if (!base) return 'public';
  const ip = parseIpPart(base);
  if (!ip) return 'public';
  return octetsPrivate(ip) ? 'private' : 'public';
}

export function recordBelongsToScope(
  record: IpamRecord,
  allRecords: IpamRecord[],
  scope: IpAddressScope,
): boolean {
  if (record.record_type === 'subnet') {
    return ipAddressScope(record.address) === scope;
  }
  const subnets = allRecords.filter((r) => r.record_type === 'subnet');
  const matches = subnets.filter((s) => hostInSubnetRecord(record, s));
  if (matches.length > 0) {
    const parent = matches.reduce((best, s) =>
      (s.cidr_prefix ?? 0) > (best.cidr_prefix ?? 0) ? s : best,
    );
    return ipAddressScope(parent.address) === scope;
  }
  return ipAddressScope(record.address) === scope;
}

export function filterRecordsByScope(records: IpamRecord[], scope: IpAddressScope): IpamRecord[] {
  return records.filter((r) => recordBelongsToScope(r, records, scope));
}

export function filterDashboardByScope(subnets: SubnetDashboard[], scope: IpAddressScope): SubnetDashboard[] {
  return subnets.filter((s) => ipAddressScope(s.address) === scope);
}

export function scopeTotals(records: IpamRecord[], scope: IpAddressScope) {
  const scoped = filterRecordsByScope(records, scope);
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
