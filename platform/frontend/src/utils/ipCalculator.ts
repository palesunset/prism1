export type IpOctets = [number, number, number, number];

export type InputRole = 'host' | 'network' | 'broadcast' | 'point-to-point';

export type SmartValidation = {
  role: InputRole;
  status: 'valid' | 'caution';
  headline: string;
  explanation: string;
  usableRangeLabel: string;
  recommendations: string[];
};

export type ClassificationEntry = {
  label: string;
  description: string;
  category: 'private' | 'public' | 'loopback' | 'link-local' | 'cgnat';
};

export type IpCalcSuccess = {
  ok: true;
  input: string;
  normalizedInput: string;
  ip: IpOctets;
  network: IpOctets;
  broadcast: IpOctets;
  subnetMask: IpOctets;
  cidr: number;
  firstUsable: IpOctets | null;
  lastUsable: IpOctets | null;
  usableRangeLabel: string;
  totalIps: number;
  usableHosts: number;
  blockSize: number;
  hostIndex: number;
  hostIndexLabel: string;
  ipBinary: string;
  maskBinary: string;
  networkBitCount: number;
  hostBitCount: number;
  classifications: ClassificationEntry[];
  isPrivate: boolean;
  isPublic: boolean;
  ciscoStaticRoute: string;
  wildcardMask: IpOctets;
  wildcardDotted: string;
  summary: string;
  validation: SmartValidation;
  legacyIpClass: string;
};

export type IpCalcFailure = { ok: false; error: string };

export type IpCalcResult = IpCalcSuccess | IpCalcFailure;

const OCTET_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)$/;

export function octetsToString(o: IpOctets): string {
  return o.join('.');
}

export function ipToUint32(o: IpOctets): number {
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

export function uint32ToIp(n: number): IpOctets {
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ] as IpOctets;
}

export function prefixToMask(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function maskToPrefix(mask: number): number | null {
  if (mask === 0) return 0;
  let prefix = 0;
  let seenZero = false;
  for (let i = 31; i >= 0; i -= 1) {
    const bit = (mask >>> i) & 1;
    if (bit === 0) {
      seenZero = true;
    } else if (seenZero) {
      return null;
    } else {
      prefix += 1;
    }
  }
  return prefix;
}

export function uint32ToBinary(n: number): string {
  const bits = n.toString(2).padStart(32, '0');
  return `${bits.slice(0, 8)}.${bits.slice(8, 16)}.${bits.slice(16, 24)}.${bits.slice(24, 32)}`;
}

export function parseIpPart(raw: string): IpOctets | null {
  const parts = raw.trim().split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!OCTET_RE.test(p)) return null;
    octets.push(Number(p));
  }
  return octets as IpOctets;
}

function parseMaskPart(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cidr = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  if (/^\d{1,2}$/.test(cidr)) {
    const prefix = Number(cidr);
    if (prefix < 0 || prefix > 32) return null;
    return prefix;
  }
  const octets = parseIpPart(trimmed);
  if (!octets) return null;
  const mask = ipToUint32(octets);
  const prefix = maskToPrefix(mask);
  if (prefix === null) return null;
  return prefix;
}

/** Combine optional split IP + mask fields into one calculation string. */
export function combineIpInputs(ipPart: string, maskPart: string): string {
  const ip = ipPart.trim();
  const mask = maskPart.trim();
  if (!ip) return '';
  if (!mask) return ip;
  if (mask.startsWith('/') || /^\d{1,2}$/.test(mask)) {
    const prefix = mask.startsWith('/') ? mask : `/${mask}`;
    return `${ip.split('/')[0]}${prefix}`;
  }
  return `${ip.split('/')[0]} ${mask}`;
}

export function parseIpInput(input: string): { ip: IpOctets; prefix: number } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: 'Enter an IP address with CIDR or subnet mask.' };

  const slashMatch = trimmed.match(/^(\S+)\/(\d{1,2})$/);
  if (slashMatch) {
    const ip = parseIpPart(slashMatch[1]);
    const prefix = Number(slashMatch[2]);
    if (!ip) return { error: 'Invalid IP address (each octet must be 0–255).' };
    if (prefix < 0 || prefix > 32) return { error: 'CIDR prefix must be between 0 and 32.' };
    return { ip, prefix };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 2) {
    const ip = parseIpPart(parts[0]);
    if (!ip) return { error: 'Invalid IP address (each octet must be 0–255).' };
    const prefix = parseMaskPart(parts[1]);
    if (prefix === null) return { error: 'Invalid subnet mask — must be contiguous (e.g. 255.255.255.224).' };
    return { ip, prefix };
  }

  return {
    error: 'Use CIDR (192.168.1.10/27), IP + mask (192.168.1.10 255.255.255.224), or fill both fields below.',
  };
}

/** Legacy classful IPv4 range (A–E) from the first octet. */
export function legacyIpClassLabel(o: IpOctets): string {
  const first = o[0];
  if (first <= 127) return 'Class A';
  if (first <= 191) return 'Class B';
  if (first <= 223) return 'Class C';
  if (first <= 239) return 'Class D';
  return 'Class E';
}

function classifyIpDetailed(o: IpOctets): ClassificationEntry[] {
  const entries: ClassificationEntry[] = [];

  if (o[0] === 10) {
    entries.push({
      label: 'Private IP (RFC1918)',
      description: '10.0.0.0/8 — reserved for private networks; not routable on the public Internet.',
      category: 'private',
    });
  } else if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) {
    entries.push({
      label: 'Private IP (RFC1918)',
      description: '172.16.0.0/12 — reserved for private networks; not routable on the public Internet.',
      category: 'private',
    });
  } else if (o[0] === 192 && o[1] === 168) {
    entries.push({
      label: 'Private IP (RFC1918)',
      description: '192.168.0.0/16 — reserved for private LANs; not routable on the public Internet.',
      category: 'private',
    });
  }

  if (o[0] === 127) {
    entries.push({
      label: 'Loopback',
      description: '127.0.0.0/8 — local host loopback; packets do not leave the device.',
      category: 'loopback',
    });
  }

  if (o[0] === 169 && o[1] === 254) {
    entries.push({
      label: 'Link-local',
      description: '169.254.0.0/16 — APIPA auto-assigned when DHCP is unavailable.',
      category: 'link-local',
    });
  }

  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) {
    entries.push({
      label: 'CGNAT',
      description: '100.64.0.0/10 — carrier-grade NAT shared space between ISP and customer CPE.',
      category: 'cgnat',
    });
  }

  if (entries.length === 0) {
    entries.push({
      label: 'Public IP',
      description: 'Globally routable address space — usable on the public Internet when assigned by a registry or ISP.',
      category: 'public',
    });
  }

  return entries;
}

function usableRange(
  network: number,
  broadcast: number,
  prefix: number,
): { first: IpOctets | null; last: IpOctets | null; usable: number } {
  const total = broadcast - network + 1;
  if (prefix === 32) {
    return { first: uint32ToIp(network), last: uint32ToIp(network), usable: 1 };
  }
  if (prefix === 31) {
    return { first: uint32ToIp(network), last: uint32ToIp(broadcast), usable: 2 };
  }
  if (total <= 2) {
    return { first: null, last: null, usable: 0 };
  }
  return {
    first: uint32ToIp(network + 1),
    last: uint32ToIp(broadcast - 1),
    usable: total - 2,
  };
}

function formatUsableRange(
  first: IpOctets | null,
  last: IpOctets | null,
  prefix: number,
): string {
  if (prefix === 32 && first) return octetsToString(first);
  if (prefix === 31 && first && last) return `${octetsToString(first)} – ${octetsToString(last)}`;
  if (!first || !last) return 'No assignable host addresses in this subnet';
  return `${octetsToString(first)} – ${octetsToString(last)}`;
}

function buildRecommendations(
  first: IpOctets | null,
  last: IpOctets | null,
  max = 3,
): string[] {
  if (!first) return [];
  const out: string[] = [octetsToString(first)];
  let current = ipToUint32(first);
  const lastNum = last ? ipToUint32(last) : current;
  for (let i = 1; i < max && current + i <= lastNum; i += 1) {
    out.push(octetsToString(uint32ToIp(current + i)));
  }
  return out;
}

function detectInputRole(
  ipNum: number,
  networkNum: number,
  broadcastNum: number,
  prefix: number,
): InputRole {
  if (prefix === 31) return 'point-to-point';
  if (prefix === 32) return 'host';
  if (ipNum === networkNum) return 'network';
  if (ipNum === broadcastNum) return 'broadcast';
  return 'host';
}

function buildSmartValidation(
  ip: IpOctets,
  network: IpOctets,
  broadcast: IpOctets,
  prefix: number,
  role: InputRole,
  first: IpOctets | null,
  last: IpOctets | null,
  usableRangeLabel: string,
): SmartValidation {
  const ipStr = octetsToString(ip);
  const netStr = octetsToString(network);
  const netCidr = `${netStr}/${prefix}`;
  const recommendations = buildRecommendations(first, last);

  if (role === 'host') {
    return {
      role,
      status: 'valid',
      headline: 'Valid host inside subnet',
      explanation: `${ipStr} is a usable host address within ${netCidr}. It can be assigned to a device such as a router interface, server, or CPE.`,
      usableRangeLabel,
      recommendations: [ipStr, ...recommendations.filter((r) => r !== ipStr).slice(0, 2)],
    };
  }

  if (role === 'point-to-point') {
    return {
      role,
      status: 'valid',
      headline: 'Valid /31 point-to-point address',
      explanation: `${ipStr} is within ${netCidr}. RFC 3021 allows both addresses in a /31 to be used as host endpoints on a point-to-point link.`,
      usableRangeLabel,
      recommendations,
    };
  }

  if (role === 'network') {
    return {
      role,
      status: 'caution',
      headline: 'Network address — not assignable to a host',
      explanation: `${ipStr} is the network address of ${netCidr}. Network addresses identify the subnet itself and cannot be assigned to devices on most platforms.`,
      usableRangeLabel,
      recommendations,
    };
  }

  return {
    role: 'broadcast',
    status: 'caution',
    headline: 'Broadcast address — not assignable to a host',
    explanation: `${ipStr} is the broadcast address of ${netCidr}. Broadcast addresses are used for subnet-wide traffic and cannot be assigned to a single device.`,
    usableRangeLabel,
    recommendations,
  };
}

export function calculateIpNetwork(input: string): IpCalcResult {
  const parsed = parseIpInput(input);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const { ip, prefix } = parsed;
  const ipNum = ipToUint32(ip);
  const maskNum = prefixToMask(prefix);
  const networkNum = (ipNum & maskNum) >>> 0;
  const broadcastNum = (networkNum | (~maskNum >>> 0)) >>> 0;

  const network = uint32ToIp(networkNum);
  const broadcast = uint32ToIp(broadcastNum);
  const subnetMask = uint32ToIp(maskNum);
  const wildcardMask = uint32ToIp((~maskNum) >>> 0);

  const totalIps = broadcastNum - networkNum + 1;
  const { first, last, usable } = usableRange(networkNum, broadcastNum, prefix);
  const blockSize = 2 ** (32 - prefix);
  const usableRangeLabel = formatUsableRange(first, last, prefix);

  const hostIndex = ipNum - networkNum;
  const hostIndexLabel =
    prefix >= 31
      ? `Address #${hostIndex + 1} of ${totalIps} in subnet`
      : `Offset ${hostIndex} from network (${hostIndex + 1} including network base)`;

  const role = detectInputRole(ipNum, networkNum, broadcastNum, prefix);
  const validation = buildSmartValidation(
    ip,
    network,
    broadcast,
    prefix,
    role,
    first,
    last,
    usableRangeLabel,
  );

  const classifications = classifyIpDetailed(ip);
  const isPrivate = classifications.some((c) => c.category === 'private');
  const isPublic = classifications.some((c) => c.category === 'public');

  const normalizedInput = `${octetsToString(ip)}/${prefix}`;
  const summary = `${octetsToString(ip)}/${prefix} → ${octetsToString(network)}/${prefix} (${usable} usable host${usable === 1 ? '' : 's'})`;
  const legacyIpClass = legacyIpClassLabel(ip);

  return {
    ok: true,
    input: input.trim(),
    normalizedInput,
    ip,
    network,
    broadcast,
    subnetMask,
    cidr: prefix,
    firstUsable: first,
    lastUsable: last,
    usableRangeLabel,
    totalIps,
    usableHosts: usable,
    blockSize,
    hostIndex,
    hostIndexLabel,
    ipBinary: uint32ToBinary(ipNum),
    maskBinary: uint32ToBinary(maskNum),
    networkBitCount: prefix,
    hostBitCount: 32 - prefix,
    classifications,
    isPrivate,
    isPublic,
    ciscoStaticRoute: `ip route ${octetsToString(network)} ${octetsToString(subnetMask)}`,
    wildcardMask,
    wildcardDotted: octetsToString(wildcardMask),
    summary,
    validation,
    legacyIpClass,
  };
}

export function resultToJson(result: IpCalcSuccess): string {
  return JSON.stringify(
    {
      input: result.input,
      normalized: result.normalizedInput,
      summary: result.summary,
      validation: result.validation,
      network: octetsToString(result.network),
      broadcast: octetsToString(result.broadcast),
      subnetMask: octetsToString(result.subnetMask),
      cidr: result.cidr,
      legacyIpClass: result.legacyIpClass,
      firstUsable: result.firstUsable ? octetsToString(result.firstUsable) : null,
      lastUsable: result.lastUsable ? octetsToString(result.lastUsable) : null,
      usableRange: result.usableRangeLabel,
      totalIps: result.totalIps,
      usableHosts: result.usableHosts,
      classifications: result.classifications,
      ciscoStaticRoute: result.ciscoStaticRoute,
      wildcard: result.wildcardDotted,
    },
    null,
    2,
  );
}

export function resultToCsv(result: IpCalcSuccess): string {
  const rows: [string, string][] = [
    ['Field', 'Value'],
    ['Input', result.input],
    ['Normalized', result.normalizedInput],
    ['Summary', result.summary],
    ['Validation', result.validation.headline],
    ['Explanation', result.validation.explanation],
    ['Usable Range', result.usableRangeLabel],
    ['Recommended', result.validation.recommendations.join(', ')],
    ['Network', octetsToString(result.network)],
    ['Broadcast', octetsToString(result.broadcast)],
    ['Subnet Mask', octetsToString(result.subnetMask)],
    ['CIDR', `/${result.cidr}`],
    ['Legacy IP Class', result.legacyIpClass],
    ['First Usable', result.firstUsable ? octetsToString(result.firstUsable) : '—'],
    ['Last Usable', result.lastUsable ? octetsToString(result.lastUsable) : '—'],
    ['Total IPs', String(result.totalIps)],
    ['Usable Hosts', String(result.usableHosts)],
    ['Block Size', String(result.blockSize)],
    ['Classification', result.classifications.map((c) => c.label).join('; ')],
    ['Cisco Route', result.ciscoStaticRoute],
    ['Wildcard', result.wildcardDotted],
  ];
  return rows.map(([k, v]) => `"${k.replace(/"/g, '""')}","${v.replace(/"/g, '""')}"`).join('\n');
}
