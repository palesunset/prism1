import {
  ipToUint32,
  octetsToString,
  parseIpInput,
  prefixToMask,
  type IpOctets,
} from './ipCalculator';
import { isIpv6Input } from './ipMathV6';
import { planVlsmV6 } from './vlsmPlannerV6';

export { planVlsmV6, parseV6RequirementValue, isV6Plan, isV6Subnet, type VlsmSubnetV6 } from './vlsmPlannerV6';

export type HostRequirementInput = {
  id: string;
  hosts?: number;
  /** IPv6: target prefix length (e.g. 64 for /64). */
  targetPrefix?: number;
  siteName?: string;
  vlanId?: string;
  department?: string;
};

export type VlsmSubnet = {
  family: 'ipv4';
  siteLabel: string;
  requiredHosts: number;
  prefix: number;
  blockSize: number;
  usableHosts: number;
  network: IpOctets;
  broadcast: IpOctets;
  firstUsable: IpOctets | null;
  lastUsable: IpOctets | null;
  subnetMask: IpOctets;
  wildcardMask: IpOctets;
  networkRangeLabel: string;
  ciscoStaticRoute: string;
  wildcardDotted: string;
  vlanId?: string;
  department?: string;
};

export type VlsmPlanSuccess = {
  ok: true;
  family: 'ipv4' | 'ipv6';
  baseNetwork: string;
  basePrefix: number;
  /** IPv4: base network octets. */
  baseNetworkAddress?: IpOctets;
  baseBroadcast?: IpOctets;
  totalBaseIps: number;
  totalBaseIpsLabel?: string;
  subnets: import('./vlsmPlannerV6').VlsmSubnetV6[] | VlsmSubnet[];
  totalAllocatedIps: number;
  totalAllocatedIpsLabel?: string;
  totalRequiredHosts: number;
  totalUnusedIps: number;
  efficiencyPercent: number;
  remainingRange: string | null;
  remainingStart: IpOctets | null;
  remainingEnd: IpOctets | null;
  warnings: string[];
  summary: string;
};

export type VlsmPlanFailure = { ok: false; error: string };

export type VlsmPlanResult = VlsmPlanSuccess | VlsmPlanFailure;

export function planNetwork(baseNetworkInput: string, requirements: HostRequirementInput[]): VlsmPlanResult {
  if (isIpv6Input(baseNetworkInput)) return planVlsmV6(baseNetworkInput, requirements);
  return planVlsm(baseNetworkInput, requirements);
}

function uint32ToIp(n: number): IpOctets {
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ] as IpOctets;
}

export function usableHostsForPrefix(prefix: number): number {
  if (prefix >= 32) return 1;
  if (prefix === 31) return 2;
  const block = 2 ** (32 - prefix);
  return block - 2;
}

/** Smallest block (largest prefix) where usable hosts ≥ requirement. */
export function prefixForHostCount(required: number): number | null {
  if (required < 1) return null;
  for (let prefix = 32; prefix >= 0; prefix -= 1) {
    if (usableHostsForPrefix(prefix) >= required) return prefix;
  }
  return null;
}

function firstLastUsable(
  networkNum: number,
  broadcastNum: number,
  prefix: number,
): { first: IpOctets | null; last: IpOctets | null } {
  if (prefix === 32) {
    const ip = uint32ToIp(networkNum);
    return { first: ip, last: ip };
  }
  if (prefix === 31) {
    return { first: uint32ToIp(networkNum), last: uint32ToIp(broadcastNum) };
  }
  if (broadcastNum - networkNum + 1 <= 2) {
    return { first: null, last: null };
  }
  return {
    first: uint32ToIp(networkNum + 1),
    last: uint32ToIp(broadcastNum - 1),
  };
}

function siteLetter(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < letters.length) return letters[index];
  return `S${index + 1}`;
}

function validateRequirements(requirements: HostRequirementInput[]): string | null {
  if (requirements.length === 0) {
    return 'Add at least one host requirement.';
  }
  for (const req of requirements) {
    const hosts = req.hosts ?? 0;
    if (!Number.isFinite(hosts) || hosts < 1) {
      return `Invalid host count${req.siteName ? ` for "${req.siteName}"` : ''}: must be a positive integer.`;
    }
    if (hosts > 2 ** 30) {
      return `Host requirement too large${req.siteName ? ` for "${req.siteName}"` : ''}.`;
    }
    if (prefixForHostCount(Math.floor(hosts)) === null) {
      return `Cannot fit ${hosts} hosts in a single IPv4 subnet.`;
    }
  }
  return null;
}

export function planVlsm(
  baseNetworkInput: string,
  requirements: HostRequirementInput[],
): VlsmPlanResult {
  const reqError = validateRequirements(requirements);
  if (reqError) return { ok: false, error: reqError };

  const parsed = parseIpInput(baseNetworkInput.trim());
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const { ip, prefix: basePrefix } = parsed;
  const ipNum = ipToUint32(ip);
  const baseMask = prefixToMask(basePrefix);
  const networkNum = (ipNum & baseMask) >>> 0;
  const broadcastNum = (networkNum | (~baseMask >>> 0)) >>> 0;
  const totalBaseIps = broadcastNum - networkNum + 1;

  const sorted = [...requirements].sort((a, b) => (b.hosts ?? 0) - (a.hosts ?? 0));

  const subnets: VlsmSubnet[] = [];
  let pointer = networkNum;
  const warnings: string[] = [];
  let totalRequiredHosts = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const req = sorted[i];
    const required = Math.floor(req.hosts ?? 0);
    totalRequiredHosts += required;

    const subnetPrefix = prefixForHostCount(required);
    if (subnetPrefix === null) {
      return { ok: false, error: `Cannot allocate subnet for ${required} hosts.` };
    }

    const blockSize = 2 ** (32 - subnetPrefix);
    if (pointer + blockSize - 1 > broadcastNum) {
      return {
        ok: false,
        error: `Insufficient space in ${octetsToString(uint32ToIp(networkNum))}/${basePrefix}: cannot fit ${required}-host subnet (${blockSize} IPs needed, ${broadcastNum - pointer + 1} remaining).`,
      };
    }

    if ((pointer - networkNum) % blockSize !== 0) {
      return {
        ok: false,
        error: 'Internal alignment error — subnets would overlap. Check requirements.',
      };
    }

    const subnetNetworkNum = pointer;
    const subnetBroadcastNum = pointer + blockSize - 1;
    const subnetMaskNum = prefixToMask(subnetPrefix);
    const wildcardNum = (~subnetMaskNum) >>> 0;

    const network = uint32ToIp(subnetNetworkNum);
    const broadcast = uint32ToIp(subnetBroadcastNum);
    const subnetMask = uint32ToIp(subnetMaskNum);
    const wildcardMask = uint32ToIp(wildcardNum);
    const { first, last } = firstLastUsable(subnetNetworkNum, subnetBroadcastNum, subnetPrefix);

    const siteLabel = req.siteName?.trim() || siteLetter(i);

    subnets.push({
      family: 'ipv4',
      siteLabel,
      requiredHosts: required,
      prefix: subnetPrefix,
      blockSize,
      usableHosts: usableHostsForPrefix(subnetPrefix),
      network,
      broadcast,
      firstUsable: first,
      lastUsable: last,
      subnetMask,
      wildcardMask,
      networkRangeLabel: `${octetsToString(network)} – ${octetsToString(broadcast)}`,
      ciscoStaticRoute: `ip route ${octetsToString(network)} ${octetsToString(subnetMask)}`,
      wildcardDotted: octetsToString(wildcardMask),
      vlanId: req.vlanId?.trim() || undefined,
      department: req.department?.trim() || undefined,
    });

    pointer += blockSize;
  }

  const totalAllocatedIps = pointer - networkNum;
  const totalUnusedIps = totalBaseIps - totalAllocatedIps;
  const efficiencyPercent =
    totalBaseIps > 0 ? Math.round((totalAllocatedIps / totalBaseIps) * 1000) / 10 : 0;

  let remainingRange: string | null = null;
  let remainingStart: IpOctets | null = null;
  let remainingEnd: IpOctets | null = null;

  if (pointer <= broadcastNum) {
    remainingStart = uint32ToIp(pointer);
    remainingEnd = uint32ToIp(broadcastNum);
    remainingRange = `${octetsToString(remainingStart)} – ${octetsToString(remainingEnd)}`;
  }

  if (totalUnusedIps > 0 && totalUnusedIps < 4) {
    warnings.push(
      `Leftover block of ${totalUnusedIps} IP(s) may be too small for typical host assignments.`,
    );
  }

  if (sorted.length >= 6) {
    warnings.push('Many small subnets increase fragmentation risk — consider summarization where possible.');
  }

  const wastedInBlocks = subnets.reduce(
    (sum, s) => sum + (s.usableHosts - s.requiredHosts),
    0,
  );
  if (wastedInBlocks > totalRequiredHosts * 0.5 && subnets.length > 1) {
    warnings.push(
      `Allocation leaves ~${wastedInBlocks} unused host slots inside subnets — review sizing for efficiency.`,
    );
  }

  const baseLabel = `${octetsToString(uint32ToIp(networkNum))}/${basePrefix}`;
  const summary = `${baseLabel}: ${subnets.length} subnet${subnets.length === 1 ? '' : 's'}, ${totalAllocatedIps}/${totalBaseIps} IPs allocated (${efficiencyPercent}% of base)`;

  return {
    ok: true,
    family: 'ipv4',
    baseNetwork: baseLabel,
    baseNetworkAddress: uint32ToIp(networkNum),
    basePrefix,
    baseBroadcast: uint32ToIp(broadcastNum),
    totalBaseIps,
    subnets,
    totalAllocatedIps,
    totalRequiredHosts,
    totalUnusedIps,
    efficiencyPercent,
    remainingRange,
    remainingStart,
    remainingEnd,
    warnings,
    summary,
  };
}

/** Parse quick-entry lines: "50", "50 hosts", "Site A 50", etc. */
export function parseHostRequirementLines(text: string): HostRequirementInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const hostsMatch = line.match(/(\d+)\s*(?:hosts?)?\s*$/i);
    const hosts = hostsMatch ? Number(hostsMatch[1]) : Number(line.replace(/\D/g, '') || 0);
    const namePart = hostsMatch
      ? line.slice(0, line.length - hostsMatch[0].length).replace(/[,\-–—]\s*$/, '').trim()
      : '';

    return {
      id: `line-${index}-${Date.now()}`,
      hosts: hosts || 0,
      siteName: namePart || undefined,
    };
  });
}

export function planToJson(result: VlsmPlanSuccess): string {
  const subnets =
    result.family === 'ipv6'
      ? result.subnets.map((s) => {
          if (!('family' in s) || s.family !== 'ipv6') return s;
          return {
            site: s.siteLabel,
            targetPrefix: s.targetPrefix,
            requiredHosts: s.requiredHosts,
            prefix: s.prefix,
            cidr: s.cidr,
            networkRange: s.networkRangeLabel,
            usableHosts: s.usableHosts,
            network: s.network,
            lastAddress: s.lastAddress,
            vlanId: s.vlanId,
            department: s.department,
          };
        })
      : result.subnets.map((s) => {
          if (!('family' in s) || s.family !== 'ipv4') return s;
          return {
            site: s.siteLabel,
            requiredHosts: s.requiredHosts,
            prefix: s.prefix,
            cidr: `${octetsToString(s.network)}/${s.prefix}`,
            networkRange: s.networkRangeLabel,
            usableHosts: s.usableHosts,
            network: octetsToString(s.network),
            broadcast: octetsToString(s.broadcast),
            firstUsable: s.firstUsable ? octetsToString(s.firstUsable) : null,
            lastUsable: s.lastUsable ? octetsToString(s.lastUsable) : null,
            subnetMask: octetsToString(s.subnetMask),
            wildcard: s.wildcardDotted,
            ciscoStaticRoute: s.ciscoStaticRoute,
            vlanId: s.vlanId,
            department: s.department,
          };
        });

  return JSON.stringify(
    {
      family: result.family,
      baseNetwork: result.baseNetwork,
      summary: result.summary,
      totalBaseIps: result.totalBaseIps,
      totalBaseIpsLabel: result.totalBaseIpsLabel,
      totalAllocatedIps: result.totalAllocatedIps,
      totalUnusedIps: result.totalUnusedIps,
      efficiencyPercent: result.efficiencyPercent,
      remainingRange: result.remainingRange,
      warnings: result.warnings,
      subnets,
    },
    null,
    2,
  );
}

export function planToCsv(result: VlsmPlanSuccess): string {
  if (result.family === 'ipv6') {
    const header = ['Site', 'Target / Prefix', 'CIDR', 'Network Range', 'Addresses', 'VLAN', 'Department'];
    const rows = result.subnets.map((s) => {
      if (!('family' in s) || s.family !== 'ipv6') return ['', '', '', '', '', '', ''];
      return [
        s.siteLabel,
        s.targetPrefix != null ? `/${s.targetPrefix}` : s.requiredHosts != null ? String(s.requiredHosts) : '',
        s.cidr,
        s.networkRangeLabel,
        s.blockSizeLabel,
        s.vlanId ?? '',
        s.department ?? '',
      ];
    });
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  }

  const header = [
    'Site',
    'Required Hosts',
    'CIDR',
    'Network Range',
    'Usable Hosts',
    'Network',
    'Broadcast',
    'First Usable',
    'Last Usable',
    'Subnet Mask',
    'Wildcard',
    'Cisco Route',
    'VLAN',
    'Department',
  ];
  const rows = result.subnets.map((s) => {
    if (!('family' in s) || s.family !== 'ipv4') {
      return ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    }
    return [
    s.siteLabel,
    String(s.requiredHosts),
    `/${s.prefix}`,
    s.networkRangeLabel,
    String(s.usableHosts),
    octetsToString(s.network),
    octetsToString(s.broadcast),
    s.firstUsable ? octetsToString(s.firstUsable) : '—',
    s.lastUsable ? octetsToString(s.lastUsable) : '—',
    octetsToString(s.subnetMask),
    s.wildcardDotted,
    s.ciscoStaticRoute,
    s.vlanId ?? '',
    s.department ?? '',
  ];
  });
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}
