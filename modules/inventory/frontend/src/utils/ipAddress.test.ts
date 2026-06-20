import { describe, expect, it } from 'vitest';
import { validateIpForForm } from './ipAddress';

describe('validateIpForForm', () => {
  it('accepts empty optional IP', () => {
    expect(validateIpForForm('')).toEqual({ ok: true, value: null });
  });

  it('canonicalizes IPv4', () => {
    const r = validateIpForForm('10.0.0.50');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('10.0.0.50');
  });

  it('canonicalizes IPv6', () => {
    const r = validateIpForForm('2001:DB8::1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('2001:db8::1');
  });

  it('rejects CIDR', () => {
    const r = validateIpForForm('10.0.0.0/24');
    expect(r.ok).toBe(false);
  });

  it('rejects invalid input', () => {
    const r = validateIpForForm('not-an-ip');
    expect(r.ok).toBe(false);
  });
});
