import ipaddr from 'ipaddr.js';

export function validateIpForForm(
  raw: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.includes('/')) {
    return { ok: false, error: 'Use a host address, not a CIDR prefix' };
  }
  try {
    const addr = ipaddr.parse(trimmed);
    if (addr.kind() === 'ipv6') {
      return { ok: true, value: addr.toString() };
    }
    return { ok: true, value: addr.toString() };
  } catch {
    return { ok: false, error: 'Invalid IPv4 or IPv6 address' };
  }
}
