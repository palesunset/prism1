import ipaddr from 'ipaddr.js';

export type V6ParsedSubnet = {
  family: 'ipv6';
  recordType: 'subnet';
  normalized: string;
  prefix: number;
  v6RangeStart: string;
  v6RangeEnd: string;
  network: string;
  lastAddress: string;
  blockSize: number | null;
  blockSizeLabel: string;
  usableHosts: number | null;
  firstUsable: string;
  lastUsable: string;
  role: 'subnet';
};

export type V6ParsedHost = {
  family: 'ipv6';
  recordType: 'host';
  normalized: string;
  prefix: 128;
  v6RangeStart: string;
  v6RangeEnd: string;
  network: string;
  lastAddress: string;
  blockSize: 1;
  blockSizeLabel: '1';
  usableHosts: 1;
  firstUsable: string;
  lastUsable: string;
  role: 'host';
};

export type V6Parsed = V6ParsedSubnet | V6ParsedHost;

export function isIpv6Input(input: string): boolean {
  return String(input ?? '').includes(':');
}

function toHex32(addr: ipaddr.IPv6): string {
  const bytes = addr.toByteArray();
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').padStart(32, '0');
}

export function addrToBigInt(addr: ipaddr.IPv6): bigint {
  const bytes = addr.toByteArray();
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

export function bigIntToHex32(n: bigint): string {
  return n.toString(16).padStart(32, '0');
}

export function bigIntToV6(n: bigint): string {
  const hex = bigIntToHex32(n);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return ipaddr.fromByteArray([...bytes]).toString();
}

export function blockSizeForPrefix(prefix: number): bigint {
  const hostBits = 128 - prefix;
  if (hostBits >= 128) return 1n;
  return 1n << BigInt(hostBits);
}

export function blockSizeNumber(prefix: number): number | null {
  const size = blockSizeForPrefix(prefix);
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(size);
}

export function formatBlockSize(prefix: number): string {
  const size = blockSizeForPrefix(prefix);
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
    return `2^${128 - prefix} addresses`;
  }
  return String(size);
}

export function cidrBounds(cidrStr: string): {
  startHex: string;
  endHex: string;
  startBI: bigint;
  endBI: bigint;
  network: string;
  prefix: number;
  lastAddress: string;
} {
  const [addr, prefix] = ipaddr.parseCIDR(cidrStr);
  if (addr.kind() !== 'ipv6') throw new Error('Expected IPv6 CIDR');
  const startBI = addrToBigInt(addr as ipaddr.IPv6);
  const hostBits = 128 - prefix;
  const endBI = hostBits >= 128 ? startBI : startBI + blockSizeForPrefix(prefix) - 1n;
  return {
    startHex: bigIntToHex32(startBI),
    endHex: bigIntToHex32(endBI),
    startBI,
    endBI,
    network: addr.toString(),
    prefix,
    lastAddress: bigIntToV6(endBI),
  };
}

export function parseV6AddressInput(input: string): V6Parsed | { error: string } {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return { error: 'Address is required.' };

  try {
    if (trimmed.includes('/')) {
      const prefix = Number(trimmed.split('/')[1]);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
        return { error: 'IPv6 CIDR prefix must be between 0 and 128.' };
      }
      const bounds = cidrBounds(trimmed);
      const normalized = `${bounds.network}/${bounds.prefix}`;
      const blockSize = blockSizeNumber(bounds.prefix);
      return {
        family: 'ipv6',
        recordType: 'subnet',
        normalized,
        prefix: bounds.prefix,
        v6RangeStart: bounds.startHex,
        v6RangeEnd: bounds.endHex,
        network: bounds.network,
        lastAddress: bounds.lastAddress,
        blockSize,
        blockSizeLabel: formatBlockSize(bounds.prefix),
        usableHosts: blockSize,
        firstUsable: bounds.network,
        lastUsable: bounds.lastAddress,
        role: 'subnet',
      };
    }

    const addr = ipaddr.parse(trimmed);
    if (addr.kind() !== 'ipv6') return { error: 'Expected an IPv6 address.' };
    const v6 = addr as ipaddr.IPv6;
    const hex = toHex32(v6);
    const normalized = v6.toString();
    return {
      family: 'ipv6',
      recordType: 'host',
      normalized,
      prefix: 128,
      v6RangeStart: hex,
      v6RangeEnd: hex,
      network: normalized,
      lastAddress: normalized,
      blockSize: 1,
      blockSizeLabel: '1',
      usableHosts: 1,
      firstUsable: normalized,
      lastUsable: normalized,
      role: 'host',
    };
  } catch {
    return { error: 'Invalid IPv6 address or CIDR notation.' };
  }
}

export function parseV6CidrInput(input: string): { network: string; prefix: number; startBI: bigint; endBI: bigint } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed.includes('/')) return { error: 'IPv6 base network must use CIDR (e.g. 2001:db8::/48).' };
  try {
    const bounds = cidrBounds(trimmed);
    return {
      network: bounds.network,
      prefix: bounds.prefix,
      startBI: bounds.startBI,
      endBI: bounds.endBI,
    };
  } catch {
    return { error: 'Invalid IPv6 base network.' };
  }
}
