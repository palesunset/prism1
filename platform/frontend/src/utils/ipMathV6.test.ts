import { describe, expect, it } from 'vitest';
import { calculateV6Network } from './ipCalculatorV6';
import { cidrBounds, parseV6AddressInput, parseV6CidrInput } from './ipMathV6';
import { planVlsmV6 } from './vlsmPlannerV6';

describe('ipMathV6', () => {
  it('parses IPv6 CIDR bounds', () => {
    const parsed = parseV6AddressInput('2001:db8::/48');
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.prefix).toBe(48);
    expect(parsed.network).toMatch(/^2001:db8/i);
  });

  it('calculates /127 host block', () => {
    const calc = calculateV6Network('2001:db8::/127');
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    expect(calc.usableHosts).toBe(2);
  });
});

describe('planVlsmV6', () => {
  it('allocates /64 subnets from /48 base', () => {
    const plan = planVlsmV6('2001:db8:1::/48', [
      { id: 'a', targetPrefix: 64, siteName: 'Site A' },
      { id: 'b', targetPrefix: 64, siteName: 'Site B' },
    ]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.subnets).toHaveLength(2);
    expect(plan.subnets[0]?.cidr).toMatch(/\/64$/);
  });

  it('rejects prefix longer than base', () => {
    const plan = planVlsmV6('2001:db8::/64', [{ id: 'a', targetPrefix: 48, siteName: 'Too big' }]);
    expect(plan.ok).toBe(false);
  });
});

describe('cidrBounds', () => {
  it('returns contiguous range for /126', () => {
    const b = cidrBounds('2001:db8::/126');
    expect(b.prefix).toBe(126);
    expect(b.startBI).toBeLessThan(b.endBI);
  });
});

describe('parseV6CidrInput', () => {
  it('requires CIDR for base network', () => {
    expect('error' in parseV6CidrInput('2001:db8::1')).toBe(true);
  });
});
