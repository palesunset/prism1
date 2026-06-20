import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Copy,
  Download,
  GripVertical,
  Network,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useFloatingPanelDrag } from '../hooks/useFloatingPanelDrag';
import { simulateVlsmImport } from '../services/ipamApi';
import { useIpamStore } from '../store/useIpamStore';
import { useVlsmPlannerStore } from '../store/useVlsmPlannerStore';
import { octetsToString } from '../utils/ipCalculator';
import { isIpv6Input } from '../utils/ipMathV6';
import { clampToViewport, type FloatingPoint } from '../utils/floatingPanel';
import {
  FLOATING_INPUT_RING,
  FLOATING_PANEL_ICON,
  FLOATING_CHROME,
  FLOATING_PANEL_SHELL,
  FLOATING_PRIMARY_BTN,
} from '../utils/floatingPanelTheme';
import {
  planNetwork,
  planToCsv,
  planToJson,
  parseV6RequirementValue,
  type HostRequirementInput,
  type VlsmPlanSuccess,
} from '../utils/vlsmPlanner';
import { isV6Subnet } from '../utils/vlsmPlannerV6';

const STORAGE_KEY = 'prism-vlsm-panel-v1';
const PANEL_W = 448;
const PANEL_H = 672;

type TabId = 'overview' | 'table' | 'details' | 'map' | 'export';

type RequirementRow = {
  id: string;
  siteName: string;
  hosts: string;
  vlanId: string;
  department: string;
};

function defaultPosition(): FloatingPoint {
  const m = 24;
  if (typeof window === 'undefined') return { x: m, y: 120 };
  return clampToViewport(m, 120, PANEL_W, PANEL_H);
}

function newRow(): RequirementRow {
  return {
    id: crypto.randomUUID(),
    siteName: '',
    hosts: '',
    vlanId: '',
    department: '',
  };
}

function TabButton(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={clsx(
        'shrink-0 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors',
        props.active
          ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500/40'
          : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
      )}
    >
      {props.children}
    </button>
  );
}

function InfoRow(props: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{props.label}</span>
      <span className={clsx('text-right text-slate-100', props.mono && 'font-mono text-xs', props.accent && 'font-medium text-violet-300')}>
        {props.value}
      </span>
    </div>
  );
}

function AllocationTable(props: { subnets: VlsmPlanSuccess['subnets']; isV6: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-[10px]">
        <thead>
          <tr className="border-b border-white/10 text-slate-500">
            <th className="px-2 py-1.5 font-medium">Site</th>
            <th className="px-2 py-1.5 font-medium">{props.isV6 ? 'Prefix / Hosts' : 'Hosts'}</th>
            <th className="px-2 py-1.5 font-medium">Subnet</th>
            <th className="px-2 py-1.5 font-medium">Range</th>
            <th className="px-2 py-1.5 font-medium">{props.isV6 ? 'Addresses' : 'Usable'}</th>
          </tr>
        </thead>
        <tbody>
          {props.subnets.map((s) => {
            if (isV6Subnet(s)) {
              return (
                <tr key={s.cidr} className="border-b border-white/5">
                  <td className="px-2 py-1.5 font-medium text-slate-200">{s.siteLabel}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-300">
                    {s.targetPrefix != null ? `/${s.targetPrefix}` : s.requiredHosts ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-cyan-300">{s.cidr}</td>
                  <td className="px-2 py-1.5 font-mono text-xs text-slate-300">{s.networkRangeLabel}</td>
                  <td className="px-2 py-1.5 tabular-nums text-emerald-400">{s.blockSizeLabel}</td>
                </tr>
              );
            }
            return (
              <tr key={`${s.siteLabel}-${octetsToString(s.network)}`} className="border-b border-white/5">
                <td className="px-2 py-1.5 font-medium text-slate-200">{s.siteLabel}</td>
                <td className="px-2 py-1.5 tabular-nums text-slate-300">{s.requiredHosts}</td>
                <td className="px-2 py-1.5 font-mono text-cyan-300">/{s.prefix}</td>
                <td className="px-2 py-1.5 font-mono text-xs text-slate-300">{s.networkRangeLabel}</td>
                <td className="px-2 py-1.5 tabular-nums text-emerald-400">{s.usableHosts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SubnetDetailCard(props: { subnet: VlsmPlanSuccess['subnets'][number]; index: number }) {
  const { subnet, index } = props;
  if (isV6Subnet(subnet)) {
    return (
      <div className="rounded-lg border border-white/10 bg-gray-900/50 p-3">
        <p className="mb-2 text-sm font-semibold text-violet-200">
          {index + 1}. {subnet.siteLabel}
          {subnet.vlanId ? <span className="ml-2 text-xs font-normal text-slate-500">VLAN {subnet.vlanId}</span> : null}
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-2"><span className="text-slate-500">CIDR</span><span className="font-mono text-cyan-300">{subnet.cidr}</span></div>
          <div className="flex justify-between gap-2"><span className="text-slate-500">Range</span><span className="font-mono text-slate-200">{subnet.networkRangeLabel}</span></div>
          <div className="flex justify-between gap-2"><span className="text-slate-500">Block size</span><span className="text-slate-200">{subnet.blockSizeLabel}</span></div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900/50 p-3">
      <p className="mb-2 text-sm font-semibold text-violet-200">
        {index + 1}. {subnet.siteLabel}
        {subnet.vlanId ? <span className="ml-2 text-xs font-normal text-slate-500">VLAN {subnet.vlanId}</span> : null}
      </p>
      {subnet.department ? (
        <p className="mb-2 text-xs text-slate-500">{subnet.department}</p>
      ) : null}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Required hosts</span>
          <span className="text-slate-200">{subnet.requiredHosts}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Network</span>
          <span className="font-mono text-slate-200">{octetsToString(subnet.network)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Broadcast</span>
          <span className="font-mono text-slate-200">{octetsToString(subnet.broadcast)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">First usable</span>
          <span className="font-mono text-emerald-300">
            {subnet.firstUsable ? octetsToString(subnet.firstUsable) : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Last usable</span>
          <span className="font-mono text-emerald-300">
            {subnet.lastUsable ? octetsToString(subnet.lastUsable) : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Subnet mask</span>
          <span className="font-mono text-slate-200">{octetsToString(subnet.subnetMask)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">CIDR</span>
          <span className="font-mono text-cyan-300">/{subnet.prefix}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Block size</span>
          <span className="text-slate-200">{subnet.blockSize} IPs</span>
        </div>
        <div className="mt-2 border-t border-white/10 pt-2">
          <p className="mb-1 text-[10px] text-slate-500">Cisco static route</p>
          <pre className="overflow-x-auto font-mono text-[10px] text-emerald-300">{subnet.ciscoStaticRoute}</pre>
          <p className="mt-1 text-[10px] text-slate-500">
            Wildcard: <span className="font-mono text-slate-300">{subnet.wildcardDotted}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function VisualMap(props: { plan: VlsmPlanSuccess }) {
  const { plan } = props;
  return (
    <div className="space-y-2">
      {plan.subnets.map((s) => {
        const key = isV6Subnet(s) ? s.cidr : `${octetsToString(s.network)}/${s.prefix}`;
        const label = isV6Subnet(s) ? s.cidr : s.networkRangeLabel;
        const meta = isV6Subnet(s)
          ? `${s.targetPrefix != null ? `/${s.targetPrefix}` : `${s.requiredHosts ?? 0} hosts`} · /${s.prefix}`
          : `${s.requiredHosts} hosts · /${s.prefix}`;
        const widthPct = plan.totalBaseIps > 0 ? Math.max(8, ((s.blockSize ?? 0) / plan.totalBaseIps) * 100) : 8;
        return (
        <div key={`map-${key}`} className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-2.5">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-violet-200">{s.siteLabel}</span>
            <span className="text-slate-500">{meta}</span>
          </div>
          <p className="font-mono text-xs text-cyan-200">{label}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
              style={{ width: `${widthPct}%` }}
            />
          </div>
        </div>
        );
      })}
      {plan.remainingRange ? (
        <div className="rounded-lg border border-dashed border-white/15 bg-gray-900/40 p-2.5">
          <p className="text-xs font-medium text-slate-400">Remaining space</p>
          <p className="font-mono text-xs text-slate-500">{plan.remainingRange}</p>
        </div>
      ) : null}
    </div>
  );
}

function ResultTabs(props: { plan: VlsmPlanSuccess }) {
  const { plan } = props;
  const [tab, setTab] = useState<TabId>('overview');
  const [ipamMsg, setIpamMsg] = useState<string | null>(null);
  const importVlsm = useIpamStore((s) => s.importVlsm);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 rounded-lg border border-violet-500/20 bg-violet-950/20 px-3 py-2 font-mono text-xs text-violet-100">
        {plan.summary}
      </div>

      {plan.warnings.length > 0 ? (
        <div className="mb-2 space-y-1 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5">
          {plan.warnings.map((w) => (
            <div key={w} className="flex items-start gap-1.5 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-2 flex justify-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-gray-900/50 p-0.5">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </TabButton>
        <TabButton active={tab === 'table'} onClick={() => setTab('table')}>
          Table
        </TabButton>
        <TabButton active={tab === 'details'} onClick={() => setTab('details')}>
          Details
        </TabButton>
        <TabButton active={tab === 'map'} onClick={() => setTab('map')}>
          Map
        </TabButton>
        <TabButton active={tab === 'export'} onClick={() => setTab('export')}>
          Export
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/40 p-3">
        {tab === 'overview' ? (
          <div className="divide-y divide-white/5">
            <InfoRow label="Base network" value={plan.baseNetwork} mono accent />
            <InfoRow label="Subnets allocated" value={String(plan.subnets.length)} />
            <InfoRow label="Total required hosts" value={String(plan.totalRequiredHosts)} />
            <InfoRow
              label={plan.family === 'ipv6' ? 'Base address space' : 'Total IPs in base'}
              value={plan.totalBaseIpsLabel ?? String(plan.totalBaseIps)}
            />
            <InfoRow
              label={plan.family === 'ipv6' ? 'Allocated space' : 'Total allocated IPs'}
              value={plan.totalAllocatedIpsLabel ?? String(plan.totalAllocatedIps)}
              accent
            />
            <InfoRow label="Unused IP space" value={String(plan.totalUnusedIps)} />
            <InfoRow label="Efficiency" value={`${plan.efficiencyPercent}%`} accent />
            <InfoRow label="Remaining range" value={plan.remainingRange ?? 'None (fully allocated)'} mono />
          </div>
        ) : null}

        {tab === 'table' ? <AllocationTable subnets={plan.subnets} isV6={plan.family === 'ipv6'} /> : null}

        {tab === 'details' ? (
          <div className="space-y-3">
            {plan.subnets.map((s, i) => (
              <SubnetDetailCard key={`detail-${isV6Subnet(s) ? s.cidr : octetsToString(s.network)}`} subnet={s} index={i} />
            ))}
          </div>
        ) : null}

        {tab === 'map' ? <VisualMap plan={plan} /> : null}

        {tab === 'export' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Export deployment-ready allocation data for Excel, IPAM, or automation pipelines.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void copyText(plan.summary)}
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
              >
                <Copy className="h-3 w-3" />
                Copy summary
              </button>
              <button
                type="button"
                onClick={() => void copyText(planToJson(plan))}
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
              >
                <Copy className="h-3 w-3" />
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() => downloadFile(planToJson(plan), 'vlsm-plan.json', 'application/json')}
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
              >
                <Download className="h-3 w-3" />
                JSON
              </button>
              <button
                type="button"
                onClick={() => downloadFile(planToCsv(plan), 'vlsm-plan.csv', 'text/csv')}
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
              >
                <Download className="h-3 w-3" />
                CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const payload = JSON.parse(planToJson(plan)) as { baseNetwork?: string; subnets: unknown[] };
                      const sim = await simulateVlsmImport(payload, plan.baseNetwork);
                      setIpamMsg(
                        `Simulation: ${sim.summary.safe} safe, ${sim.summary.skipped} skipped` +
                          (sim.skipped.length ? ` — ${sim.skipped.map((s) => s.address).join(', ')}` : ''),
                      );
                    } catch (e) {
                      setIpamMsg(e instanceof Error ? e.message : 'Simulation failed');
                    }
                  })();
                }}
                className="inline-flex items-center gap-1 rounded-md bg-amber-600/30 px-2 py-1 text-[10px] text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-600/40"
              >
                Dry run
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const payload = JSON.parse(planToJson(plan)) as { baseNetwork?: string; subnets: unknown[] };
                      const result = await importVlsm(payload, plan.baseNetwork);
                      setIpamMsg(`Saved ${result.created} subnet(s) to Mini IPAM${result.errors ? ` (${result.errors} conflicts skipped)` : ''}.`);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'IPAM import failed';
                      setIpamMsg(
                        /fetch|network|connection/i.test(msg)
                          ? 'Mini IPAM API unavailable — start the dev stack with npm run dev (port 3003).'
                          : msg,
                      );
                    }
                  })();
                }}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600/30 px-2 py-1 text-[10px] text-indigo-200 ring-1 ring-indigo-500/40 hover:bg-indigo-600/40"
              >
                Save to IPAM
              </button>
            </div>
            {ipamMsg ? <p className="text-[10px] text-slate-400">{ipamMsg}</p> : null}
            <pre className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-gray-950/80 p-2 font-mono text-[10px] text-slate-400">
              {planToJson(plan)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function VlsmPlannerPanel() {
  const panelOpen = useVlsmPlannerStore((s) => s.panelOpen);
  const closePanel = useVlsmPlannerStore((s) => s.closePanel);
  const [baseNetwork, setBaseNetwork] = useState('10.0.0.0/24');
  const [rows, setRows] = useState<RequirementRow[]>(() => [
    { ...newRow(), siteName: 'A', hosts: '50' },
    { ...newRow(), siteName: 'B', hosts: '25' },
    { ...newRow(), siteName: 'C', hosts: '10' },
    { ...newRow(), siteName: 'D', hosts: '5' },
  ]);
  const [result, setResult] = useState<ReturnType<typeof planNetwork> | null>(null);
  const isV6Base = isIpv6Input(baseNetwork);

  const { rootRef, position, onDragStart, onDragMove, onDragEnd } = useFloatingPanelDrag({
    storageKey: STORAGE_KEY,
    defaultPosition,
    defaultWidth: PANEL_W,
    defaultHeight: PANEL_H,
    enabled: panelOpen,
  });

  const buildRequirements = useCallback((): HostRequirementInput[] => {
    const v6 = isIpv6Input(baseNetwork);
    return rows
      .filter((r) => r.hosts.trim())
      .map((r) => {
        const base: HostRequirementInput = {
          id: r.id,
          siteName: r.siteName.trim() || undefined,
          vlanId: r.vlanId.trim() || undefined,
          department: r.department.trim() || undefined,
        };
        if (v6) {
          const parsed = parseV6RequirementValue(r.hosts);
          if (parsed?.targetPrefix != null) return { ...base, targetPrefix: parsed.targetPrefix };
          if (parsed?.hosts != null) return { ...base, hosts: parsed.hosts };
          return { ...base, hosts: 0 };
        }
        return { ...base, hosts: Number(r.hosts) };
      })
      .filter((r) => (r.hosts ?? 0) > 0 || r.targetPrefix != null);
  }, [rows, baseNetwork]);

  const runPlan = useCallback(() => {
    setResult(planNetwork(baseNetwork, buildRequirements()));
  }, [baseNetwork, buildRequirements]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel, panelOpen]);

  const success = result?.ok ? result : null;
  const error = result && !result.ok ? result.error : null;

  return (
    <AnimatePresence>
      {panelOpen ? (
        <motion.div
          key="vlsm-planner-panel"
          className={clsx('fixed z-[196] flex w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden', FLOATING_CHROME, FLOATING_PANEL_SHELL)}
          style={{
            left: position.x,
            top: position.y,
            height: 'min(42rem, calc(100vh - 2rem))',
            maxHeight: 'min(42rem, calc(100vh - 2rem))',
          }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          aria-label="VLSM Planner"
        >
          <div ref={rootRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-2">
            <div
              className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-1.5 active:cursor-grabbing"
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
              <Network className={clsx('h-4 w-4 shrink-0', FLOATING_PANEL_ICON)} strokeWidth={2} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-100">VLSM Planner</h2>
                <p className="truncate text-[9px] text-slate-500">IPv4 + IPv6 · network design · export to Mini IPAM</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
              aria-label="Close VLSM planner"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Base network (CIDR)
            </label>
            <input
              className="mb-2 w-full rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-violet-500/40 placeholder:text-slate-600 focus:ring-2"
              placeholder={isV6Base ? '2001:db8::/48' : '10.0.0.0/24'}
              value={baseNetwork}
              onChange={(e) => setBaseNetwork(e.target.value)}
              spellCheck={false}
            />

            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {isV6Base ? 'Prefix (/64) or host count (/112–/128)' : 'Host requirements'}
              </span>
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, newRow()])}
                className="inline-flex items-center gap-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-white/15"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>

            <div className="mb-2 max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/40 p-2">
              {rows.map((row) => (
                <div key={row.id} className="flex gap-1">
                  <input
                    className="w-10 shrink-0 rounded border border-white/10 bg-gray-900/80 px-1.5 py-1 text-center text-xs text-slate-100 outline-none focus:ring-1 focus:ring-violet-500/40"
                    placeholder="Site"
                    value={row.siteName}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, siteName: e.target.value } : r)),
                      )
                    }
                    spellCheck={false}
                  />
                  <input
                    className="w-14 shrink-0 rounded border border-white/10 bg-gray-900/80 px-1.5 py-1 text-center font-mono text-xs text-slate-100 outline-none focus:ring-1 focus:ring-violet-500/40"
                    placeholder="Hosts"
                    inputMode="numeric"
                    value={row.hosts}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, hosts: e.target.value.replace(/\D/g, '') } : r)),
                      )
                    }
                  />
                  <input
                    className="w-12 shrink-0 rounded border border-white/10 bg-gray-900/80 px-1.5 py-1 text-center text-xs text-slate-100 outline-none focus:ring-1 focus:ring-violet-500/40"
                    placeholder="VLAN"
                    value={row.vlanId}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, vlanId: e.target.value } : r)),
                      )
                    }
                    spellCheck={false}
                  />
                  <input
                    className="min-w-0 flex-1 rounded border border-white/10 bg-gray-900/80 px-1.5 py-1 text-xs text-slate-100 outline-none focus:ring-1 focus:ring-violet-500/40"
                    placeholder="Department"
                    value={row.department}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, department: e.target.value } : r)),
                      )
                    }
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== row.id) : prev))}
                    className="shrink-0 rounded p-1 text-slate-500 hover:bg-white/10 hover:text-rose-300"
                    aria-label="Remove requirement"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={runPlan}
              className={clsx('mb-2 shrink-0', FLOATING_PRIMARY_BTN, 'py-2')}
            >
              Generate plan
            </button>

            {error ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                {error}
              </div>
            ) : null}

            {success ? <ResultTabs plan={success} /> : null}
          </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
