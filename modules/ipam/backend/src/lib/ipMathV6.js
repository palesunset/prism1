import ipaddr from 'ipaddr.js';

export function isIpv6Input(input) {
  return String(input ?? '').includes(':');
}

function toHex32(addr) {
  return Buffer.from(addr.toByteArray()).toString('hex').padStart(32, '0');
}

function addrToBigInt(addr) {
  const bytes = addr.toByteArray();
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function bigIntToHex32(n) {
  return n.toString(16).padStart(32, '0');
}

function cidrBounds(cidrStr) {
  const [addr, prefix] = ipaddr.parseCIDR(cidrStr);
  const startBI = addrToBigInt(addr);
  const hostBits = 128 - prefix;
  const endBI = hostBits >= 128 ? startBI : startBI + (1n << BigInt(hostBits)) - 1n;
  return {
    startHex: bigIntToHex32(startBI),
    endHex: bigIntToHex32(endBI),
    network: addr.toString(),
    prefix,
    lastAddr: ipaddr.fromByteArray([...Buffer.from(bigIntToHex32(endBI), 'hex')]).toString(),
  };
}

export function parseV6AddressInput(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return { error: 'Address is required.' };

  try {
    if (trimmed.includes('/')) {
      const prefix = Number(trimmed.split('/')[1]);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
        return { error: 'IPv6 CIDR prefix must be between 0 and 128.' };
      }
      const [addr] = ipaddr.parseCIDR(trimmed);
      if (addr.kind() !== 'ipv6') return { error: 'Expected an IPv6 CIDR (e.g. 2001:db8::/32).' };
      const bounds = cidrBounds(trimmed);
      const normalized = `${bounds.network}/${bounds.prefix}`;
      const blockSize =
        bounds.prefix === 128
          ? 1
          : Number((1n << BigInt(128 - bounds.prefix)) > BigInt(Number.MAX_SAFE_INTEGER)
              ? Number.MAX_SAFE_INTEGER
              : 1n << BigInt(128 - bounds.prefix));
      return {
        family: 'ipv6',
        recordType: 'subnet',
        normalized,
        prefix: bounds.prefix,
        rangeStart: 0,
        rangeEnd: 0,
        v6RangeStart: bounds.startHex,
        v6RangeEnd: bounds.endHex,
        network: bounds.network,
        broadcast: bounds.lastAddr,
        blockSize,
        usableHosts: blockSize,
        firstUsable: bounds.network,
        lastUsable: bounds.lastAddr,
        role: 'subnet',
      };
    }

    const addr = ipaddr.parse(trimmed);
    if (addr.kind() !== 'ipv6') return { error: 'Expected an IPv6 address.' };
    const hex = toHex32(addr);
    const normalized = addr.toString();
    return {
      family: 'ipv6',
      recordType: 'host',
      normalized,
      prefix: 128,
      rangeStart: 0,
      rangeEnd: 0,
      v6RangeStart: hex,
      v6RangeEnd: hex,
      network: normalized,
      broadcast: normalized,
      blockSize: 1,
      usableHosts: 1,
      firstUsable: normalized,
      lastUsable: normalized,
      role: 'host',
    };
  } catch {
    return { error: 'Invalid IPv6 address or CIDR notation.' };
  }
}

export function v6RangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function v6ContainsRange(outerStart, outerEnd, innerStart, innerEnd) {
  return outerStart <= innerStart && outerEnd >= innerEnd;
}

export function v6HexToDisplay(hex) {
  try {
    const buf = Buffer.from(hex.padStart(32, '0'), 'hex');
    return ipaddr.fromByteArray([...buf]).toString();
  } catch {
    return hex;
  }
}

export function v6PointInRange(hex, start, end) {
  return start <= hex && hex <= end;
}
