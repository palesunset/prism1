import type { ClassificationEntry, SmartValidation } from './ipCalculator';
import {
  addrToBigInt,
  blockSizeNumber,
  formatBlockSize,
  isIpv6Input,
  parseV6AddressInput,
} from './ipMathV6';
import ipaddr from 'ipaddr.js';

export type IpCalcSuccessV6 = {
  ok: true;
  family: 'ipv6';
  input: string;
  normalizedInput: string;
  address: string;
  network: string;
  lastAddress: string;
  cidr: number;
  firstUsable: string | null;
  lastUsable: string | null;
  usableRangeLabel: string;
  totalAddresses: number | null;
  totalAddressesLabel: string;
  usableHosts: number | null;
  blockSize: number | null;
  blockSizeLabel: string;
  hostIndexLabel: string;
  classifications: ClassificationEntry[];
  isPrivate: boolean;
  isPublic: boolean;
  summary: string;
  validation: SmartValidation;
};

export type IpCalcFailureV6 = { ok: false; error: string };

export type IpCalcResultV6 = IpCalcSuccessV6 | IpCalcFailureV6;

function formatUsableRange(first: string, last: string, prefix: number): string {
  if (prefix === 128) return first;
  if (first === last) return first;
  return `${first} – ${last}`;
}

function classifyV6(address: string): ClassificationEntry[] {
  const entries: ClassificationEntry[] = [];
  try {
    const addr = ipaddr.parse(address);
    if (addr.kind() !== 'ipv6') return entries;
    const v6 = addr as ipaddr.IPv6;
    const range = v6.range();

    if (range === 'loopback') {
      entries.push({
        label: 'Loopback',
        description: '::1/128 — local host loopback; packets do not leave the device.',
        category: 'loopback',
      });
    }
    if (range === 'linkLocal') {
      entries.push({
        label: 'Link-local',
        description: 'fe80::/10 — on-link addresses; not routable beyond the local segment.',
        category: 'link-local',
      });
    }
    if (range === 'uniqueLocal') {
      entries.push({
        label: 'Unique local (ULA)',
        description: 'fc00::/7 — private IPv6 space (RFC 4193); not globally routable.',
        category: 'private',
      });
    }
    if (v6.isIPv4MappedAddress()) {
      entries.push({
        label: 'IPv4-mapped',
        description: '::ffff:0:0/96 — IPv4 address embedded in IPv6 notation.',
        category: 'public',
      });
    }
    if (entries.length === 0 && (range === 'unicast' || range === 'unspecified')) {
      entries.push({
        label: 'Global unicast',
        description: 'Globally routable IPv6 unicast when assigned by an RIR/ISP.',
        category: 'public',
      });
    }
  } catch {
    /* ignore */
  }
  return entries;
}

function buildV6Validation(parsed: Exclude<ReturnType<typeof parseV6AddressInput>, { error: string }>): SmartValidation {
  const role = parsed.recordType === 'subnet' ? 'network' : 'host';
  return {
    role: role as 'host' | 'network',
    status: 'valid',
    headline: parsed.recordType === 'subnet' ? 'IPv6 prefix' : 'IPv6 host address',
    explanation:
      parsed.recordType === 'subnet'
        ? `Prefix /${parsed.prefix} spans ${parsed.blockSizeLabel} addresses.`
        : 'Single /128 host assignment.',
    usableRangeLabel: formatUsableRange(parsed.firstUsable, parsed.lastUsable, parsed.prefix),
    recommendations: [],
  };
}

/** Normalize bare IPv6 host to /128 for calculation. */
export function normalizeV6CalcInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.includes('/') && isIpv6Input(trimmed)) return trimmed;
  return trimmed;
}

export function calculateV6Network(input: string): IpCalcResultV6 {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Enter an IPv6 address or CIDR.' };
  if (!isIpv6Input(trimmed)) return { ok: false, error: 'Expected an IPv6 address or CIDR.' };

  const parsed = parseV6AddressInput(trimmed);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  return buildV6Result(input, parsed);
}

function buildV6Result(rawInput: string, parsed: Exclude<ReturnType<typeof parseV6AddressInput>, { error: string }>): IpCalcSuccessV6 {
  const classifications = classifyV6(parsed.network);
  const isPrivate = classifications.some((c) => c.category === 'private' || c.category === 'link-local');
  const isPublic = classifications.some((c) => c.category === 'public');
  const validation = buildV6Validation(parsed);
  const usableRangeLabel = formatUsableRange(parsed.firstUsable, parsed.lastUsable, parsed.prefix);

  let hostIndexLabel = 'Host address (/128)';
  if (parsed.recordType === 'host' && parsed.prefix === 128) {
    hostIndexLabel = 'Single host in /128 assignment';
  } else if (parsed.recordType === 'subnet') {
    hostIndexLabel = `Prefix /${parsed.prefix} · ${parsed.blockSizeLabel} total addresses`;
  }

  const summary =
    parsed.recordType === 'subnet'
      ? `${parsed.normalized} → ${parsed.blockSizeLabel} addresses`
      : `${parsed.normalized} → host (/128)`;

  return {
    ok: true,
    family: 'ipv6',
    input: rawInput.trim(),
    normalizedInput: parsed.normalized,
    address: parsed.recordType === 'host' ? parsed.network : parsed.network,
    network: parsed.network,
    lastAddress: parsed.lastAddress,
    cidr: parsed.prefix,
    firstUsable: parsed.firstUsable,
    lastUsable: parsed.lastUsable,
    usableRangeLabel,
    totalAddresses: parsed.blockSize,
    totalAddressesLabel: parsed.blockSizeLabel,
    usableHosts: parsed.usableHosts,
    blockSize: parsed.blockSize,
    blockSizeLabel: parsed.blockSizeLabel,
    hostIndexLabel,
    classifications,
    isPrivate,
    isPublic,
    summary,
    validation,
  };
}

export function combineV6Inputs(ipPart: string, maskPart: string): string {
  const ip = ipPart.trim();
  const mask = maskPart.trim();
  if (!ip) return '';
  if (!mask) return ip;
  if (mask.startsWith('/') || /^\d{1,3}$/.test(mask)) {
    const prefix = mask.startsWith('/') ? mask : `/${mask}`;
    return `${ip.split('/')[0]}${prefix}`;
  }
  return ip;
}

/** Host offset within a prefix (for /128 always 0). */
export function v6HostIndexLabel(address: string, prefix: number): string {
  if (prefix === 128) return 'Single /128 host';
  try {
    const addr = ipaddr.parse(address) as ipaddr.IPv6;
    const bounds = parseV6AddressInput(`${address}/${prefix}`);
    if ('error' in bounds) return '—';
    const start = BigInt(`0x${bounds.v6RangeStart}`);
    const offset = addrToBigInt(addr) - start;
    if (offset < 0n) return 'Outside prefix';
    return `Offset ${offset.toString()} from network base`;
  } catch {
    return '—';
  }
}

export function resultToJsonV6(result: IpCalcSuccessV6): string {
  return JSON.stringify(result, null, 2);
}

export function resultToCsvV6(result: IpCalcSuccessV6): string {
  const rows = [
    ['Field', 'Value'],
    ['Family', 'IPv6'],
    ['Input', result.input],
    ['Normalized', result.normalizedInput],
    ['Network', result.network],
    ['Last address', result.lastAddress],
    ['CIDR', `/${result.cidr}`],
    ['Block size', result.blockSizeLabel],
    ['Usable range', result.usableRangeLabel],
    ['Summary', result.summary],
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(escape).join(',')).join('\n');
}
