/** IPv4/IPv6 address math for IPAM. */

import { isIpv6Input, parseV6AddressInput } from './ipMathV6.js';

const OCTET_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)$/;

export function parseIpPart(raw) {
  const parts = String(raw).trim().split('.');
  if (parts.length !== 4) return null;
  const octets = [];
  for (const p of parts) {
    if (!OCTET_RE.test(p)) return null;
    octets.push(Number(p));
  }
  return octets;
}

export function octetsToString(o) {
  return o.join('.');
}

export function ipToUint32(o) {
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

export function uint32ToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

export function prefixToMask(prefix) {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function parseAddressInput(input, recordType) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return { error: 'Address is required.' };

  if (isIpv6Input(trimmed)) {
    if (recordType === 'host' && trimmed.includes('/')) {
      return { error: 'Host records cannot use CIDR. Enter a single IPv6 address.' };
    }
    if (recordType === 'subnet' && !trimmed.includes('/')) {
      return { error: 'Subnet records must use CIDR notation (e.g. 2001:db8::/32).' };
    }
    return parseV6AddressInput(trimmed);
  }

  const slashMatch = trimmed.match(/^(\S+)\/(\d{1,2})$/);
  if (slashMatch) {
    const ip = parseIpPart(slashMatch[1]);
    const prefix = Number(slashMatch[2]);
    if (!ip) return { error: 'Invalid IP address (each octet must be 0–255).' };
    if (prefix < 0 || prefix > 32) return { error: 'CIDR prefix must be between 0 and 32.' };
    const ipNum = ipToUint32(ip);
    const mask = prefixToMask(prefix);
    const networkNum = (ipNum & mask) >>> 0;
    const broadcastNum = (networkNum | (~mask >>> 0)) >>> 0;
    const network = uint32ToIp(networkNum);
    const broadcast = uint32ToIp(broadcastNum);
    const normalized = `${octetsToString(network)}/${prefix}`;
    const blockSize = broadcastNum - networkNum + 1;
    let firstUsable = null;
    let lastUsable = null;
    let usableHosts = blockSize;
    if (prefix === 32) {
      firstUsable = network;
      lastUsable = network;
      usableHosts = 1;
    } else if (prefix === 31) {
      firstUsable = network;
      lastUsable = broadcast;
      usableHosts = 2;
    } else if (blockSize > 2) {
      firstUsable = uint32ToIp(networkNum + 1);
      lastUsable = uint32ToIp(broadcastNum - 1);
      usableHosts = blockSize - 2;
    } else {
      usableHosts = 0;
    }
    let role = 'host';
    if (ipNum === networkNum) role = 'network';
    else if (ipNum === broadcastNum) role = 'broadcast';
    else if (prefix >= 31) role = 'host';
    else role = 'host';

    return {
      family: 'ipv4',
      v6RangeStart: null,
      v6RangeEnd: null,
      recordType: 'subnet',
      address: normalized,
      network,
      broadcast,
      prefix,
      networkNum,
      broadcastNum,
      rangeStart: networkNum,
      rangeEnd: broadcastNum,
      blockSize,
      usableHosts,
      firstUsable,
      lastUsable,
      role,
      normalized,
    };
  }

  const ip = parseIpPart(trimmed.split('/')[0]);
  if (!ip) return { error: 'Invalid IP address (each octet must be 0–255).' };
  const ipNum = ipToUint32(ip);
  return {
    family: 'ipv4',
    v6RangeStart: null,
    v6RangeEnd: null,
    recordType: 'host',
    address: octetsToString(ip),
    network: ip,
    broadcast: ip,
    prefix: 32,
    networkNum: ipNum,
    broadcastNum: ipNum,
    rangeStart: ipNum,
    rangeEnd: ipNum,
    blockSize: 1,
    usableHosts: 1,
    firstUsable: ip,
    lastUsable: ip,
    role: 'host',
    normalized: octetsToString(ip),
  };
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function containsRange(outerStart, outerEnd, innerStart, innerEnd) {
  return outerStart <= innerStart && outerEnd >= innerEnd;
}

export function ipInRange(ipNum, start, end) {
  return ipNum >= start && ipNum <= end;
}

export function prefixToDotted(prefix) {
  return octetsToString(uint32ToIp(prefixToMask(prefix)));
}

export function validationSummary(parsed) {
  if (parsed.error) return null;
  if (parsed.family === 'ipv6') {
    return {
      family: 'ipv6',
      network: parsed.network,
      broadcast: parsed.broadcast,
      prefix: parsed.prefix,
      cidr: `/${parsed.prefix}`,
      blockSize: parsed.blockSize,
      usableHosts: parsed.usableHosts,
      firstUsable: parsed.firstUsable ?? null,
      lastUsable: parsed.lastUsable ?? null,
      role: parsed.role,
      usableRange:
        parsed.firstUsable && parsed.lastUsable
          ? `${parsed.firstUsable} – ${parsed.lastUsable}`
          : parsed.normalized,
    };
  }
  return {
    network: octetsToString(parsed.network),
    broadcast: octetsToString(parsed.broadcast),
    prefix: parsed.prefix,
    cidr: `/${parsed.prefix}`,
    blockSize: parsed.blockSize,
    usableHosts: parsed.usableHosts,
    firstUsable: parsed.firstUsable ? octetsToString(parsed.firstUsable) : null,
    lastUsable: parsed.lastUsable ? octetsToString(parsed.lastUsable) : null,
    role: parsed.role,
    usableRange:
      parsed.firstUsable && parsed.lastUsable
        ? `${octetsToString(parsed.firstUsable)} – ${octetsToString(parsed.lastUsable)}`
        : parsed.normalized,
  };
}
