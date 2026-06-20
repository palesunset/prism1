/** Optional host field validation for IPAM records. */

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
const HOSTNAME_RE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function validateMacAddress(value) {
  if (value == null || value === '') return { ok: true };
  const raw = String(value).trim();
  if (!MAC_RE.test(raw)) {
    return { ok: false, error: 'MAC address must use AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF format.' };
  }
  const normalized = raw.toUpperCase().replace(/-/g, ':');
  return { ok: true, normalized };
}

export function validateHostname(value) {
  if (value == null || value === '') return { ok: true };
  const raw = String(value).trim();
  if (raw.length > 253) return { ok: false, error: 'Hostname is too long (max 253 characters).' };
  if (!HOSTNAME_RE.test(raw)) {
    return { ok: false, error: 'Invalid hostname (use letters, digits, hyphens, and dots).' };
  }
  return { ok: true, normalized: raw.toLowerCase() };
}

export function validateExtendedHostFields(body) {
  if (body.mac_address !== undefined && body.mac_address !== null && body.mac_address !== '') {
    const mac = validateMacAddress(body.mac_address);
    if (!mac.ok) return mac;
    body.mac_address = mac.normalized;
  }
  if (body.hostname !== undefined && body.hostname !== null && body.hostname !== '') {
    const host = validateHostname(body.hostname);
    if (!host.ok) return host;
    body.hostname = host.normalized;
  }
  return { ok: true };
}
