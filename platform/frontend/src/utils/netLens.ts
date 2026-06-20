import { calculateIpNetwork, octetsToString } from './ipCalculator';
import { calculateV6Network } from './ipCalculatorV6';
import { isIpv6Input } from './ipMathV6';
import { planNetwork, type HostRequirementInput } from './vlsmPlanner';
import { isV6Subnet } from './vlsmPlannerV6';
import {
  searchIp,
  simulateVlsmImport,
  validateRecord,
  type IpamConflict,
  type IpamInventoryCrossCheck,
  type NetLensWorkflowPayload,
} from '../services/ipamApi';

export type NetLensInputMode = 'ip' | 'cidr' | 'vlsm';

export type NetLensValidation = {
  status: 'valid' | 'invalid';
  errors: string[];
  summary: string;
};

export type NetLensAnalysis = {
  network: string;
  broadcast: string;
  usableRange: string;
  totalIps: number;
  usableHosts: number;
  cidr: string;
  role: string;
  normalizedInput: string;
  vlsmSummary?: string;
  vlsmSubnets?: { cidr: string; hosts: number; site: string }[];
};

export type NetLensInsights = {
  overlaps: string[];
  conflicts: string[];
  suggestions: string[];
  warnings: string[];
  ipamReachable: boolean;
  inventory?: IpamInventoryCrossCheck;
};

export type NetLensResult = {
  inputMode: NetLensInputMode;
  validation: NetLensValidation;
  analysis: NetLensAnalysis | null;
  insights: NetLensInsights;
};

type ParsedInput =
  | { mode: 'ip' | 'cidr'; query: string }
  | { mode: 'vlsm'; baseNetwork: string; hosts: number[] };

export function parseNetLensInput(raw: string): ParsedInput | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'Enter an IP, CIDR subnet, or VLSM preview.' };

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hostsLine = lines.find((l) => /^hosts\s*:/i.test(l));

  if (hostsLine || lines.length > 1) {
    const base = lines.find((l) => l.includes('/')) ?? lines[0];
    let hostCounts: number[] = [];
    if (hostsLine) {
      hostCounts = hostsLine
        .replace(/^hosts\s*:\s*/i, '')
        .split(/[,;\s]+/)
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else {
      hostCounts = lines
        .filter((l) => l !== base && /^\d+$/.test(l))
        .map((l) => Number.parseInt(l, 10));
    }
    if (!base?.includes('/')) {
      return { error: 'VLSM preview needs a base network with CIDR (e.g. 10.0.0.0/24).' };
    }
    if (hostCounts.length === 0) {
      return { error: 'Add host counts: a line like "hosts: 50, 20, 10" or one number per line.' };
    }
    return { mode: 'vlsm', baseNetwork: base, hosts: hostCounts };
  }

  const single = trimmed.split(/\s+/)[0] ?? trimmed;
  if (single.includes('/')) return { mode: 'cidr', query: single };
  return { mode: 'ip', query: single };
}

function collectSuggestions(conflicts: IpamConflict[]): string[] {
  const out: string[] = [];
  for (const c of conflicts) {
    if (c.suggestion) out.push(c.suggestion);
  }
  return [...new Set(out)];
}

async function queryIpamReadOnly(
  address: string,
  recordType: 'host' | 'subnet',
): Promise<{
  conflicts: IpamConflict[];
  suggestions: string[];
  overlaps: string[];
  warnings: string[];
  reachable: boolean;
  inventory?: IpamInventoryCrossCheck;
}> {
  const overlaps: string[] = [];
  const conflicts: string[] = [];
  const warnings: string[] = [];
  let suggestions: string[] = [];
  let reachable = false;

  try {
    const search = await searchIp(address);
    reachable = true;
    if (search.exactMatches.length > 0) {
      for (const m of search.exactMatches) {
        overlaps.push(`Exact match in IPAM: ${m.address} (${m.record_type}, ${m.status}) — ${m.project || 'no project'}`);
      }
    }
    if (search.containingSubnets.length > 0) {
      for (const s of search.containingSubnets) {
        warnings.push(`Inside registered subnet ${s.address} (${s.project || 'no project'})`);
      }
    }
    if (search.members.length > 0 && recordType === 'subnet') {
      warnings.push(`${search.members.length} host record(s) already registered in this block`);
    }
    for (const c of search.conflicts) {
      conflicts.push(c.message);
    }
    suggestions = collectSuggestions(search.conflicts);

    const validate = await validateRecord({
      address,
      record_type: recordType,
      status: 'used',
      inventory_crosscheck: recordType === 'host',
    });
    for (const c of validate.conflicts ?? validate.blocking ?? []) {
      if (!conflicts.includes(c.message)) conflicts.push(c.message);
    }
    for (const w of validate.warnings ?? []) {
      warnings.push(w.message);
    }
    suggestions = [...new Set([...suggestions, ...collectSuggestions(validate.conflicts ?? [])])];
    return {
      conflicts,
      suggestions,
      overlaps,
      warnings,
      reachable: true,
      inventory: validate.inventory,
    };
  } catch {
    reachable = false;
  }

  return { conflicts, suggestions, overlaps, warnings, reachable };
}

export async function analyzeNetLens(raw: string): Promise<NetLensResult> {
  const parsed = parseNetLensInput(raw);
  if ('error' in parsed) {
    return {
      inputMode: 'ip',
      validation: { status: 'invalid', errors: [parsed.error], summary: parsed.error },
      analysis: null,
      insights: { overlaps: [], conflicts: [], suggestions: [], warnings: [], ipamReachable: false },
    };
  }

  if (parsed.mode === 'vlsm') {
    const requirements: HostRequirementInput[] = parsed.hosts.map((value, i) => {
      const siteName = `Site ${String.fromCharCode(65 + i)}`;
      if (isIpv6Input(parsed.baseNetwork) && value >= 32 && value <= 128) {
        return { id: `nl-${i}`, targetPrefix: value, siteName };
      }
      return { id: `nl-${i}`, hosts: value, siteName };
    });

    const plan = planNetwork(parsed.baseNetwork, requirements);
    if (!plan.ok) {
      return {
        inputMode: 'vlsm',
        validation: { status: 'invalid', errors: [plan.error], summary: plan.error },
        analysis: null,
        insights: { overlaps: [], conflicts: [], suggestions: [], warnings: [], ipamReachable: false },
      };
    }

    const analysis: NetLensAnalysis =
      plan.family === 'ipv6'
        ? {
            network: plan.baseNetwork.split('/')[0] ?? plan.baseNetwork,
            broadcast: plan.subnets[0] && isV6Subnet(plan.subnets[0]) ? plan.subnets[plan.subnets.length - 1]!.lastAddress : plan.baseNetwork,
            usableRange: plan.remainingRange ?? plan.summary,
            totalIps: plan.totalBaseIps,
            usableHosts: plan.totalRequiredHosts,
            cidr: plan.baseNetwork,
            role: 'vlsm-plan',
            normalizedInput: plan.baseNetwork,
            vlsmSummary: plan.summary,
            vlsmSubnets: plan.subnets.map((s) =>
              isV6Subnet(s)
                ? { cidr: s.cidr, hosts: s.requiredHosts ?? s.targetPrefix ?? 0, site: s.siteLabel }
                : { cidr: `${octetsToString(s.network)}/${s.prefix}`, hosts: s.requiredHosts, site: s.siteLabel },
            ),
          }
        : {
            network: octetsToString(plan.baseNetworkAddress!),
            broadcast: octetsToString(plan.baseBroadcast!),
            usableRange: plan.remainingRange ?? `${plan.summary}`,
            totalIps: plan.totalBaseIps,
            usableHosts: plan.totalRequiredHosts,
            cidr: plan.baseNetwork,
            role: 'vlsm-plan',
            normalizedInput: plan.baseNetwork,
            vlsmSummary: plan.summary,
            vlsmSubnets: plan.subnets.map((s) =>
              isV6Subnet(s)
                ? { cidr: s.cidr, hosts: s.requiredHosts ?? 0, site: s.siteLabel }
                : { cidr: `${octetsToString(s.network)}/${s.prefix}`, hosts: s.requiredHosts, site: s.siteLabel },
            ),
          };

    const insights: NetLensInsights = {
      overlaps: [],
      conflicts: [],
      suggestions: [],
      warnings: [...plan.warnings],
      ipamReachable: false,
    };

    if (plan.remainingRange) {
      insights.suggestions.push(`Remaining space after plan: ${plan.remainingRange}`);
    }
    if (plan.efficiencyPercent < 70) {
      insights.suggestions.push('Consider reordering requirements or resizing blocks to improve allocation efficiency.');
    }

    try {
      const sim = await simulateVlsmImport(
        {
          baseNetwork: plan.baseNetwork,
          subnets: plan.subnets.map((s) =>
            isV6Subnet(s)
              ? {
                  cidr: s.cidr,
                  site: s.siteLabel,
                  requiredHosts: s.requiredHosts ?? s.targetPrefix ?? 0,
                  prefix: s.prefix,
                }
              : {
                  cidr: `${octetsToString(s.network)}/${s.prefix}`,
                  site: s.siteLabel,
                  requiredHosts: s.requiredHosts,
                  prefix: s.prefix,
                },
          ),
        },
        'NetLens preview',
      );
      insights.ipamReachable = true;
      for (const skip of sim.skipped ?? []) {
        insights.conflicts.push(`${skip.address}: ${skip.reasons.join('; ')}`);
      }
      for (const safe of sim.safe ?? []) {
        for (const w of safe.warnings ?? []) {
          insights.warnings.push(w.message);
        }
      }
      if (sim.summary.skipped > 0) {
        insights.suggestions.push(`${sim.summary.skipped} subnet(s) would conflict with IPAM — adjust plan before import.`);
      } else if (sim.summary.safe === sim.summary.total) {
        insights.suggestions.push('All planned subnets pass IPAM dry-run — safe to import via System Control or VLSM Planner.');
      }
    } catch {
      insights.warnings.push('IPAM VLSM simulation unavailable — plan computed locally only.');
    }

    return {
      inputMode: 'vlsm',
      validation: {
        status: 'valid',
        errors: [],
        summary: `VLSM plan for ${plan.subnets.length} subnet(s) · ${plan.efficiencyPercent}% efficiency`,
      },
      analysis,
      insights,
    };
  }

  const calcInput = parsed.mode === 'ip' ? `${parsed.query}/32` : parsed.query;
  const calc = calculateIpNetwork(calcInput);
  const isV6 = parsed.query.includes(':');

  if (isV6) {
    const recordType = parsed.mode === 'cidr' ? 'subnet' : 'host';
    const address = parsed.mode === 'ip' ? parsed.query : parsed.query.trim();
    const calcInput = parsed.mode === 'ip' && !address.includes('/') ? address : address;
    const v6Calc = calculateV6Network(calcInput.includes('/') || parsed.mode === 'cidr' ? calcInput : calcInput);

    let validationStatus: 'valid' | 'invalid' = v6Calc.ok ? 'valid' : 'invalid';
    const validationErrors: string[] = v6Calc.ok ? [] : [v6Calc.error];

    if (v6Calc.ok) {
      try {
        const formatCheck = await validateRecord({
          address: v6Calc.normalizedInput,
          record_type: recordType,
          status: 'used',
        });
        const blocking = formatCheck.blocking ?? formatCheck.conflicts ?? [];
        const formatIssue = blocking.some((c) =>
          /invalid|malformed|parse|prefix length|not a valid/i.test(c.message),
        );
        if (!formatCheck.allowed && formatIssue) {
          validationStatus = 'invalid';
          validationErrors.length = 0;
          for (const c of blocking) validationErrors.push(c.message);
        }
      } catch {
        validationErrors.push('IPAM unavailable — could not validate IPv6 format.');
      }
    }

    const ipam = await queryIpamReadOnly(
      v6Calc.ok ? v6Calc.normalizedInput.split('/')[0] ?? v6Calc.normalizedInput : address.split('/')[0] ?? address,
      recordType,
    );

    const analysis: NetLensAnalysis | null =
      v6Calc.ok && validationStatus === 'valid'
        ? {
            network: v6Calc.network,
            broadcast: v6Calc.lastAddress,
            usableRange: v6Calc.usableRangeLabel,
            totalIps: v6Calc.totalAddresses ?? 0,
            usableHosts: v6Calc.usableHosts ?? 0,
            cidr: v6Calc.normalizedInput,
            role: recordType,
            normalizedInput: v6Calc.normalizedInput,
          }
        : null;

    const suggestions = [...ipam.suggestions];
    if (ipam.inventory?.matches?.length) {
      suggestions.push(
        `Inventory: ${ipam.inventory.matches.length} equipment match(es) for this address.`,
      );
    }
    if (validationStatus === 'valid' && ipam.conflicts.length === 0 && ipam.overlaps.length === 0 && ipam.reachable) {
      suggestions.push('No IPAM conflicts detected for this IPv6 input.');
    }
    return {
      inputMode: parsed.mode,
      validation: {
        status: validationStatus,
        errors: validationErrors,
        summary:
          validationStatus === 'valid' && v6Calc.ok
            ? v6Calc.summary
            : validationErrors[0] ?? 'Invalid IPv6 input',
      },
      analysis,
      insights: {
        overlaps: ipam.overlaps,
        conflicts: ipam.conflicts,
        suggestions: [...new Set(suggestions)],
        warnings: ipam.warnings,
        ipamReachable: ipam.reachable,
        inventory: ipam.inventory,
      },
    };
  }

  if (!calc.ok) {
    return {
      inputMode: parsed.mode,
      validation: { status: 'invalid', errors: [calc.error], summary: calc.error },
      analysis: null,
      insights: { overlaps: [], conflicts: [], suggestions: [], warnings: [], ipamReachable: false },
    };
  }

  const recordType = parsed.mode === 'cidr' ? 'subnet' : 'host';
  const ipam = await queryIpamReadOnly(calc.normalizedInput, recordType);

  const analysis: NetLensAnalysis = {
    network: octetsToString(calc.network),
    broadcast: octetsToString(calc.broadcast),
    usableRange: calc.usableRangeLabel,
    totalIps: calc.totalIps,
    usableHosts: calc.usableHosts,
    cidr: `${octetsToString(calc.network)}/${calc.cidr}`,
    role: calc.validation.role,
    normalizedInput: calc.normalizedInput,
  };

  const suggestions = [...ipam.suggestions];
  if (calc.validation.recommendations.length > 0) {
    suggestions.push(...calc.validation.recommendations);
  }
  if (ipam.conflicts.length === 0 && ipam.overlaps.length === 0 && ipam.reachable) {
    suggestions.push('No IPAM conflicts detected for this input.');
  }
  if (parsed.mode === 'cidr' && calc.usableHosts > 0) {
    suggestions.push(`This block supports up to ${calc.usableHosts} usable host(s) at /${calc.cidr}.`);
  }

  const validationErrors: string[] = [];
  if (calc.validation.status === 'caution') {
    validationErrors.push(calc.validation.explanation);
  }

  return {
    inputMode: parsed.mode,
    validation: {
      status: 'valid',
      errors: validationErrors,
      summary: calc.validation.headline,
    },
    analysis,
    insights: {
      overlaps: ipam.overlaps,
      conflicts: ipam.conflicts,
      suggestions: [...new Set(suggestions)],
      warnings: ipam.warnings,
      ipamReachable: ipam.reachable,
      inventory: ipam.inventory,
    },
  };
}

/** Map NetLens analysis to IP Workflow Manager attachment payload. */
export function netLensResultToWorkflowPayload(result: NetLensResult): NetLensWorkflowPayload {
  const valid = result.validation.status === 'valid';
  const conflicts = [...result.insights.conflicts, ...result.insights.overlaps];
  return {
    valid,
    overlap: result.insights.overlaps.length > 0,
    conflicts,
    suggestion: result.insights.suggestions[0],
    warnings: result.insights.warnings,
    validation: result.validation,
    insights: result.insights,
    analysis: result.analysis ?? undefined,
  };
}
