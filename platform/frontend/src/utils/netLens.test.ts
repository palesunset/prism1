import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchIp, validateRecord } = vi.hoisted(() => ({
  searchIp: vi.fn(),
  validateRecord: vi.fn(),
}));

vi.mock('../services/ipamApi', () => ({
  searchIp,
  validateRecord,
  simulateVlsmImport: vi.fn(),
}));

describe('analyzeNetLens IPAM reachability', () => {
  beforeEach(async () => {
    searchIp.mockReset();
    validateRecord.mockReset();
    vi.resetModules();
  });

  it('maps ipam.reachable to insights.ipamReachable for bare IPv4 hosts', async () => {
    searchIp.mockResolvedValue({
      query: '10.0.0.10/32',
      parsed: {
        network: '10.0.0.10',
        broadcast: '10.0.0.10',
        prefix: 32,
        cidr: '10.0.0.10/32',
        blockSize: 1,
        usableHosts: 1,
        firstUsable: '10.0.0.10',
        lastUsable: '10.0.0.10',
        role: 'host',
        usableRange: '10.0.0.10',
      },
      assignmentStatus: 'free',
      exactMatches: [],
      containingSubnets: [],
      members: [],
      conflicts: [],
      membership: 'unassigned',
    });
    validateRecord.mockResolvedValue({
      allowed: true,
      conflicts: [],
      blocking: [],
      warnings: [],
    });

    const { analyzeNetLens } = await import('./netLens');
    const result = await analyzeNetLens('10.0.0.10');

    expect(searchIp).toHaveBeenCalledWith('10.0.0.10/32');
    expect(result.validation.status).toBe('valid');
    expect(result.insights.ipamReachable).toBe(true);
    expect(result.insights.suggestions.some((s) => s.includes('No IPAM conflicts detected'))).toBe(true);
  });

  it('sets ipamReachable false when IPAM API is unavailable', async () => {
    searchIp.mockRejectedValue(new Error('connection refused'));

    const { analyzeNetLens } = await import('./netLens');
    const result = await analyzeNetLens('10.0.0.10');

    expect(result.insights.ipamReachable).toBe(false);
    expect(result.insights.warnings.some((w) => w.includes('IPAM API unavailable'))).toBe(false);
  });
});
