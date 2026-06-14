import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Calculator, CheckCircle2, Copy, Download, GripVertical, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useFloatingPanelDrag } from '../hooks/useFloatingPanelDrag';
import { useIpCalculatorStore } from '../store/useIpCalculatorStore';
import {
  calculateIpNetwork,
  combineIpInputs,
  octetsToString,
  resultToCsv,
  resultToJson,
  type ClassificationEntry,
  type InputRole,
  type IpCalcSuccess,
} from '../utils/ipCalculator';
import { clampToViewport, type FloatingPoint } from '../utils/floatingPanel';

const STORAGE_KEY = 'prism-ip-calc-panel-v1';
const PANEL_W = 448;
const PANEL_H = 672;

type TabId = 'allocation' | 'overview' | 'hosts' | 'binary' | 'router' | 'classification';

function inputRoleLabel(role: InputRole): string {
  switch (role) {
    case 'network':
      return 'Network';
    case 'broadcast':
      return 'Broadcast';
    case 'point-to-point':
      return 'Point-to-point';
    default:
      return 'Host';
  }
}

function inputRoleValueClass(role: InputRole): string {
  switch (role) {
    case 'network':
      return 'font-medium text-rose-400';
    case 'broadcast':
      return 'font-medium text-amber-400';
    case 'host':
      return 'font-medium text-emerald-400';
    default:
      return 'text-slate-100';
  }
}

function defaultPosition(): FloatingPoint {
  const m = 24;
  if (typeof window === 'undefined') return { x: m, y: 96 };
  return clampToViewport(Math.max(m, window.innerWidth - PANEL_W - m), 96, PANEL_W, PANEL_H);
}

function InfoRow(props: { label: string; value: string; mono?: boolean; valueClassName?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{props.label}</span>
      <span
        className={clsx(
          'text-right',
          props.mono && 'font-mono text-xs',
          props.valueClassName ?? 'text-slate-100',
        )}
      >
        {props.value}
      </span>
    </div>
  );
}

function ValidationCard(props: { result: IpCalcSuccess }) {
  const { validation } = props.result;
  const isValid = validation.status === 'valid';

  return (
    <div
      className={clsx(
        'rounded-lg border p-3',
        isValid
          ? 'border-emerald-500/30 bg-emerald-950/20'
          : 'border-amber-500/30 bg-amber-950/20',
      )}
    >
      <div className="mb-2 flex items-start gap-2">
        {isValid ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm font-semibold', isValid ? 'text-emerald-200' : 'text-amber-200')}>
            {validation.headline}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{validation.explanation}</p>
        </div>
      </div>
      <div className="ml-6 space-y-2 border-t border-white/10 pt-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Usable range</p>
          <p className="font-mono text-xs text-slate-100">{validation.usableRangeLabel}</p>
        </div>
        {validation.recommendations.length > 0 ? (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Recommended assignment
            </p>
            <ul className="mt-1 space-y-0.5">
              {validation.recommendations.map((ip) => (
                <li key={ip} className="font-mono text-xs text-cyan-300">
                  {ip}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BinaryDisplay(props: { binary: string; networkBits: number; label: string }) {
  const flat = props.binary.replace(/\./g, '');
  const groups = props.binary.split('.');

  return (
    <div className="rounded-lg border border-white/10 bg-gray-900/60 p-3">
      <p className="mb-2 text-xs font-medium text-slate-400">{props.label}</p>
      <div className="mb-2 flex flex-wrap gap-x-0.5 font-mono text-[11px] leading-relaxed">
        {flat.split('').map((bit, i) => (
          <span
            key={`${props.label}-${i}`}
            className={i < props.networkBits ? 'text-cyan-400' : 'text-amber-300'}
          >
            {bit}
          </span>
        ))}
      </div>
      <p className="font-mono text-[10px] text-slate-500">{groups.join(' · ')}</p>
      <p className="mt-2 text-[10px] text-slate-600">
        <span className="text-cyan-400/80">Network bits</span>
        {' · '}
        <span className="text-amber-300/80">Host bits</span>
      </p>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={clsx(
        'shrink-0 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors',
        props.active
          ? 'bg-cyan-600/25 text-cyan-200 ring-1 ring-cyan-500/40'
          : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
      )}
    >
      {props.children}
    </button>
  );
}

function classificationStyle(category: ClassificationEntry['category']): string {
  switch (category) {
    case 'private':
      return 'border-violet-500/30 bg-violet-950/30';
    case 'loopback':
    case 'link-local':
      return 'border-amber-500/30 bg-amber-950/30';
    case 'cgnat':
      return 'border-orange-500/30 bg-orange-950/30';
    default:
      return 'border-emerald-500/30 bg-emerald-950/30';
  }
}

function ResultTabs(props: { result: IpCalcSuccess }) {
  const { result } = props;
  const [tab, setTab] = useState<TabId>('allocation');

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
      <div className="mb-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2 font-mono text-xs text-cyan-100">
        {result.summary}
      </div>

      <div className="mb-2 flex justify-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-gray-900/50 p-0.5">
        <TabButton active={tab === 'allocation'} onClick={() => setTab('allocation')}>
          Allocation
        </TabButton>
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </TabButton>
        <TabButton active={tab === 'hosts'} onClick={() => setTab('hosts')}>
          Hosts
        </TabButton>
        <TabButton active={tab === 'binary'} onClick={() => setTab('binary')}>
          Binary
        </TabButton>
        <TabButton active={tab === 'router'} onClick={() => setTab('router')}>
          Router
        </TabButton>
        <TabButton active={tab === 'classification'} onClick={() => setTab('classification')}>
          Class
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/40 p-3">
        {tab === 'overview' ? (
          <div className="divide-y divide-white/5">
            <InfoRow
              label="Input role"
              value={inputRoleLabel(result.validation.role)}
              valueClassName={inputRoleValueClass(result.validation.role)}
            />
            <InfoRow label="IP class" value={result.legacyIpClass} />
            <InfoRow label="Network" value={`${octetsToString(result.network)}/${result.cidr}`} mono />
            <InfoRow label="Broadcast" value={octetsToString(result.broadcast)} mono />
            <InfoRow label="Subnet mask" value={octetsToString(result.subnetMask)} mono />
            <InfoRow label="CIDR" value={`/${result.cidr}`} />
            <InfoRow label="Block size" value={String(result.blockSize)} />
            <InfoRow label="Total IPs" value={String(result.totalIps)} />
            <InfoRow label="Usable hosts" value={String(result.usableHosts)} />
            <InfoRow
              label="Full range"
              value={`${octetsToString(result.network)} – ${octetsToString(result.broadcast)}`}
              mono
            />
          </div>
        ) : null}

        {tab === 'allocation' ? <ValidationCard result={result} /> : null}

        {tab === 'hosts' ? (
          <div className="divide-y divide-white/5">
            <InfoRow label="Input IP" value={octetsToString(result.ip)} mono />
            <InfoRow label="Input type" value={result.validation.headline} />
            <InfoRow label="First usable" value={result.firstUsable ? octetsToString(result.firstUsable) : '—'} mono />
            <InfoRow label="Last usable" value={result.lastUsable ? octetsToString(result.lastUsable) : '—'} mono />
            <InfoRow label="Usable range" value={result.usableRangeLabel} mono />
            <InfoRow label="Usable count" value={String(result.usableHosts)} />
            <InfoRow label="Position" value={result.hostIndexLabel} />
          </div>
        ) : null}

        {tab === 'binary' ? (
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Engineering mode</p>
            <BinaryDisplay binary={result.ipBinary} networkBits={result.networkBitCount} label="IP address" />
            <BinaryDisplay binary={result.maskBinary} networkBits={result.networkBitCount} label="Subnet mask" />
            <InfoRow label="Network bits" value={String(result.networkBitCount)} />
            <InfoRow label="Host bits" value={String(result.hostBitCount)} />
          </div>
        ) : null}

        {tab === 'router' ? (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-slate-500">Cisco static route</p>
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-gray-950/80 p-2 font-mono text-xs text-emerald-300">
                {result.ciscoStaticRoute}
              </pre>
            </div>
            <InfoRow label="Network" value={octetsToString(result.network)} mono />
            <InfoRow label="Mask (dotted)" value={octetsToString(result.subnetMask)} mono />
            <InfoRow label="Wildcard mask" value={result.wildcardDotted} mono />
            <p className="text-[10px] leading-relaxed text-slate-600">
              Wildcard is the inverse of the subnet mask — used in ACLs, route maps, and OSPF/EIGRP network
              statements.
            </p>
          </div>
        ) : null}

        {tab === 'classification' ? (
          <div className="space-y-2">
            {result.classifications.map((entry) => (
              <div
                key={entry.label}
                className={clsx('rounded-lg border p-3', classificationStyle(entry.category))}
              >
                <p className="text-sm font-semibold text-slate-100">{entry.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{entry.description}</p>
              </div>
            ))}
            <InfoRow
              label="Assignability"
              value={result.isPrivate ? 'Private — internal use only' : result.isPublic ? 'Public — globally routable when assigned' : 'Special-use range'}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void copyText(result.summary)}
          className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
        >
          <Copy className="h-3 w-3" />
          Copy summary
        </button>
        <button
          type="button"
          onClick={() => void copyText(resultToJson(result))}
          className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
        >
          <Copy className="h-3 w-3" />
          Copy JSON
        </button>
        <button
          type="button"
          onClick={() => downloadFile(resultToJson(result), 'ip-calc.json', 'application/json')}
          className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
        >
          <Download className="h-3 w-3" />
          JSON
        </button>
        <button
          type="button"
          onClick={() => downloadFile(resultToCsv(result), 'ip-calc.csv', 'text/csv')}
          className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/15"
        >
          <Download className="h-3 w-3" />
          CSV
        </button>
      </div>
    </div>
  );
}

export function IpCalculatorPanel() {
  const panelOpen = useIpCalculatorStore((s) => s.panelOpen);
  const closePanel = useIpCalculatorStore((s) => s.closePanel);
  const [ipInput, setIpInput] = useState('');
  const [maskInput, setMaskInput] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calculateIpNetwork> | null>(null);

  const { rootRef, position, onDragStart, onDragMove, onDragEnd } = useFloatingPanelDrag({
    storageKey: STORAGE_KEY,
    defaultPosition,
    defaultWidth: PANEL_W,
    defaultHeight: PANEL_H,
    enabled: panelOpen,
  });

  const runCalc = useCallback(() => {
    const combined = combineIpInputs(ipInput, maskInput);
    if (!combined.trim()) {
      setResult(null);
      return;
    }
    setResult(calculateIpNetwork(combined));
  }, [ipInput, maskInput]);

  useEffect(() => {
    if (!panelOpen) return;
    const combined = combineIpInputs(ipInput, maskInput);
    if (!combined.trim()) {
      setResult(null);
      return;
    }
    const t = window.setTimeout(runCalc, 120);
    return () => window.clearTimeout(t);
  }, [ipInput, maskInput, panelOpen, runCalc]);

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
          ref={rootRef}
          className="fixed z-[197] flex w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-gray-950/95 shadow-2xl backdrop-blur-md"
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
          aria-label="IP Calculator"
        >
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
              <Calculator className="h-4 w-4 shrink-0 text-cyan-400" strokeWidth={2} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-100">IP Calculator</h2>
                <p className="truncate text-[9px] text-slate-500">Network engineering tool</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
              aria-label="Close IP calculator"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              IP address
            </label>
            <input
              className="mb-2 w-full rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-cyan-500/40 placeholder:text-slate-600 focus:ring-2"
              placeholder="192.168.1.10 or 192.168.1.10/27"
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runCalc();
              }}
              spellCheck={false}
            />
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Subnet mask / CIDR (optional)
            </label>
            <div className="mb-2 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-cyan-500/40 placeholder:text-slate-600 focus:ring-2"
                placeholder="/27 or 255.255.255.224"
                value={maskInput}
                onChange={(e) => setMaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runCalc();
                }}
                spellCheck={false}
              />
              <button
                type="button"
                onClick={runCalc}
                className="shrink-0 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                Calculate
              </button>
            </div>

            {error ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                {error}
              </div>
            ) : null}

            {success ? <ResultTabs result={success} /> : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
