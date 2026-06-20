import {
  bigIntToV6,
  blockSizeForPrefix,
  blockSizeNumber,
  formatBlockSize,
  isIpv6Input,
  parseV6CidrInput,
} from './ipMathV6';
import type { HostRequirementInput, VlsmPlanFailure, VlsmPlanResult, VlsmPlanSuccess } from './vlsmPlanner';

export type VlsmSubnetV6 = {
  family: 'ipv6';
  siteLabel: string;
  requiredHosts?: number;
  targetPrefix?: number;
  prefix: number;
  cidr: string;
  blockSize: number | null;
  blockSizeLabel: string;
  usableHosts: number | null;
  network: string;
  lastAddress: string;
  firstUsable: string | null;
  lastUsable: string | null;
  networkRangeLabel: string;
  vlanId?: string;
  department?: string;
};

export function parseV6RequirementValue(raw: string): { hosts?: number; targetPrefix?: number } | null {
  const v = raw.trim();
  if (!v) return null;
  const prefixMatch = v.match(/^\/?(\d{1,3})$/);
  if (prefixMatch) {
    const p = Number(prefixMatch[1]);
    if (p >= 0 && p <= 128) return { targetPrefix: p };
  }
  const hosts = Number.parseInt(v.replace(/\D/g, ''), 10);
  if (Number.isFinite(hosts) && hosts > 0) return { hosts };
  return null;
}

export function prefixForHostCountV6(required: number): number | null {
  if (required < 1) return null;
  for (let prefix = 128; prefix >= 112; prefix -= 1) {
    const block = blockSizeNumber(prefix);
    if (block !== null && block >= required) return prefix;
  }
  return null;
}

function siteLetter(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < letters.length) return letters[index];
  return `S${index + 1}`;
}

function resolveSubnetPrefix(req: HostRequirementInput): number | null {
  if (req.targetPrefix != null) {
    if (req.targetPrefix < 0 || req.targetPrefix > 128) return null;
    return req.targetPrefix;
  }
  if (req.hosts != null && req.hosts > 0) {
    return prefixForHostCountV6(Math.floor(req.hosts));
  }
  return null;
}

export function planVlsmV6(baseNetworkInput: string, requirements: HostRequirementInput[]): VlsmPlanResult {
  if (requirements.length === 0) return { ok: false, error: 'Add at least one requirement.' };

  const base = parseV6CidrInput(baseNetworkInput.trim());
  if ('error' in base) return { ok: false, error: base.error };

  const enriched = requirements.map((req, i) => {
    const prefix = resolveSubnetPrefix(req);
    if (prefix === null) {
      return {
        error: req.targetPrefix != null
          ? `Invalid target prefix${req.siteName ? ` for "${req.siteName}"` : ''}.`
          : `Cannot fit ${req.hosts} hosts in IPv6 — use prefix mode (/64) or host counts for /112–/128 only.`,
      } as const;
    }
    if (prefix <= base.prefix) {
      return {
        error: `Subnet /${prefix}${req.siteName ? ` for "${req.siteName}"` : ''} must be longer than base /${base.prefix}.`,
      } as const;
    }
    return { req, prefix, index: i };
  });

  for (const item of enriched) {
    if ('error' in item) return { ok: false, error: item.error };
  }

  const sorted = (enriched as { req: HostRequirementInput; prefix: number; index: number }[]).sort(
    (a, b) => a.prefix - b.prefix,
  );

  const subnets: VlsmSubnetV6[] = [];
  let pointer = base.startBI;
  const warnings: string[] = [];
  let totalRequiredHosts = 0;
  let totalAllocated = 0n;

  for (let i = 0; i < sorted.length; i += 1) {
    const { req, prefix } = sorted[i];
    const blockSize = blockSizeForPrefix(prefix);
    const subnetEnd = pointer + blockSize - 1n;

    if (subnetEnd > base.endBI) {
      return {
        ok: false,
        error: `Insufficient space in ${base.network}/${base.prefix}: cannot fit /${prefix} subnet (${formatBlockSize(prefix)} needed).`,
      };
    }

    if ((pointer - base.startBI) % blockSize !== 0n) {
      return { ok: false, error: 'Internal alignment error — subnets would overlap.' };
    }

    const network = bigIntToV6(pointer);
    const lastAddress = bigIntToV6(subnetEnd);
    const siteLabel = req.siteName?.trim() || siteLetter(i);
    const requiredHosts = req.hosts != null ? Math.floor(req.hosts) : undefined;
    if (requiredHosts) totalRequiredHosts += requiredHosts;

    const blockNum = blockSizeNumber(prefix);
    subnets.push({
      family: 'ipv6',
      siteLabel,
      requiredHosts,
      targetPrefix: req.targetPrefix,
      prefix,
      cidr: `${network}/${prefix}`,
      blockSize: blockNum,
      blockSizeLabel: formatBlockSize(prefix),
      usableHosts: blockNum,
      network,
      lastAddress,
      firstUsable: network,
      lastUsable: lastAddress,
      networkRangeLabel: `${network} – ${lastAddress}`,
      vlanId: req.vlanId?.trim() || undefined,
      department: req.department?.trim() || undefined,
    });

    pointer += blockSize;
    totalAllocated += blockSize;
  }

  const totalBase = base.endBI - base.startBI + 1n;
  const totalUnused = totalBase - totalAllocated;
  const efficiencyPercent =
    totalBase > 0n ? Math.round(Number((totalAllocated * 10000n) / totalBase)) / 100 : 0;

  let remainingRange: string | null = null;
  if (pointer <= base.endBI) {
    remainingRange = `${bigIntToV6(pointer)} – ${bigIntToV6(base.endBI)}`;
  }

  if (totalUnused > 0n && totalUnused < 4n) {
    warnings.push('Leftover space may be too small for typical assignments.');
  }

  const baseLabel = `${base.network}/${base.prefix}`;
  const summary = `${baseLabel}: ${subnets.length} IPv6 prefix${subnets.length === 1 ? '' : 'es'} allocated (${efficiencyPercent}% of base)`;

  const plan: VlsmPlanSuccess = {
    ok: true,
    family: 'ipv6',
    baseNetwork: baseLabel,
    basePrefix: base.prefix,
    totalBaseIps: totalBase > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(totalBase),
    totalBaseIpsLabel: formatBlockSize(base.prefix),
    subnets,
    totalAllocatedIps: totalAllocated > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(totalAllocated),
    totalAllocatedIpsLabel: formatBlockSize(base.prefix),
    totalRequiredHosts,
    totalUnusedIps: totalUnused > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(totalUnused),
    efficiencyPercent,
    remainingRange,
    remainingStart: null,
    remainingEnd: null,
    warnings,
    summary,
  };

  return plan;
}

export function isV6Plan(plan: VlsmPlanSuccess): plan is VlsmPlanSuccess & { family: 'ipv6'; subnets: VlsmSubnetV6[] } {
  return plan.family === 'ipv6';
}

export function isV6Subnet(subnet: VlsmPlanSuccess['subnets'][number]): subnet is VlsmSubnetV6 {
  return 'family' in subnet && subnet.family === 'ipv6';
}
