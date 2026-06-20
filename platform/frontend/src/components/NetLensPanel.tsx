import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  GripVertical,
  Loader2,
  ScanEye,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useFloatingPanelDrag } from '../hooks/useFloatingPanelDrag';
import { useNetLensStore } from '../store/useNetLensStore';
import { useIpamStore } from '../store/useIpamStore';
import { analyzeNetLens, netLensResultToWorkflowPayload, type NetLensResult } from '../utils/netLens';
import { attachWorkflowNetLens, createWorkflowRequest } from '../services/ipamApi';
import { clampToViewport, type FloatingPoint } from '../utils/floatingPanel';
import {
  FLOATING_INPUT_RING,
  FLOATING_PANEL_ICON,
  FLOATING_CHROME,
  FLOATING_PANEL_SHELL,
  FLOATING_PRIMARY_BTN,
} from '../utils/floatingPanelTheme';

const STORAGE_KEY = 'prism-netlens-panel-v1';
const PANEL_W = 448;
const PANEL_H = 672;

const PLACEHOLDER = `192.168.1.10
192.168.1.0/27
2001:db8::1
2001:db8::/48
10.0.0.0/24
hosts: 50, 20, 10`;

function defaultPosition(): FloatingPoint {
  const m = 24;
  if (typeof window === 'undefined') return { x: m, y: 88 };
  return clampToViewport(m, 88, PANEL_W, PANEL_H);
}

function Section(props: { title: string; tone: 'valid' | 'analysis' | 'insights'; children: React.ReactNode }) {
  const border =
    props.tone === 'valid'
      ? 'border-emerald-500/25 bg-emerald-950/10'
      : props.tone === 'analysis'
        ? 'border-indigo-500/25 bg-indigo-950/10'
        : 'border-amber-500/25 bg-amber-950/10';
  const titleColor =
    props.tone === 'valid' ? 'text-emerald-300' : props.tone === 'analysis' ? 'text-indigo-300' : 'text-amber-300';

  return (
    <section className={clsx('rounded-lg border p-3', border)}>
      <h3 className={clsx('mb-2 text-[10px] font-semibold uppercase tracking-wide', titleColor)}>{props.title}</h3>
      {props.children}
    </section>
  );
}

function ResultView(props: { result: NetLensResult }) {
  const { result } = props;
  const valid = result.validation.status === 'valid';

  return (
    <div className="space-y-3">
      <Section title="Validation status" tone="valid">
        <div className="flex items-start gap-2">
          {valid ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          )}
          <div className="min-w-0 text-xs">
            <p className={clsx('font-semibold capitalize', valid ? 'text-emerald-200' : 'text-rose-200')}>
              {result.validation.status}
            </p>
            <p className="mt-0.5 text-slate-400">{result.validation.summary}</p>
            {result.validation.errors.map((e) => (
              <p key={e} className="mt-1 text-amber-300/90">{e}</p>
            ))}
          </div>
        </div>
      </Section>

      {result.analysis ? (
        <Section title="Network analysis" tone="analysis">
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Mode</dt>
              <dd className="font-mono capitalize text-slate-200">{result.inputMode}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Network</dt>
              <dd className="font-mono text-slate-100">{result.analysis.network}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">{result.analysis.role === 'subnet' || result.inputMode === 'cidr' ? 'Last address' : 'Broadcast'}</dt>
              <dd className="font-mono text-slate-100">{result.analysis.broadcast}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Usable range</dt>
              <dd className="font-mono text-emerald-300">{result.analysis.usableRange}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Total IPs</dt>
              <dd className="text-slate-200">{result.analysis.totalIps}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Usable hosts</dt>
              <dd className="text-slate-200">{result.analysis.usableHosts}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">CIDR</dt>
              <dd className="font-mono text-indigo-200">{result.analysis.cidr}</dd>
            </div>
          </dl>
          {result.analysis.vlsmSubnets ? (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="mb-1.5 text-[10px] uppercase text-slate-500">VLSM simulation</p>
              <ul className="space-y-1">
                {result.analysis.vlsmSubnets.map((s) => (
                  <li key={s.cidr} className="flex justify-between gap-2 font-mono text-[10px] text-slate-300">
                    <span>{s.cidr}</span>
                    <span className="text-slate-500">{s.site} · {s.hosts}h</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="Intelligence insights" tone="insights">
        {!result.insights.ipamReachable && result.inputMode !== 'vlsm' ? (
          <p className="mb-2 text-[10px] text-slate-500">IPAM read-only check offline — local math only.</p>
        ) : null}
        {result.insights.overlaps.length === 0 &&
        result.insights.conflicts.length === 0 &&
        result.insights.warnings.length === 0 &&
        result.insights.suggestions.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-300/90">
            <CheckCircle2 className="h-3.5 w-3.5" />
            No overlap or conflict signals detected.
          </p>
        ) : null}
        {result.insights.overlaps.length > 0 ? (
          <div className="mb-2">
            <p className="mb-1 text-[10px] font-medium text-amber-200">Overlaps</p>
            <ul className="space-y-1 text-[10px] text-slate-300">
              {result.insights.overlaps.map((o) => (
                <li key={o} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.insights.conflicts.length > 0 ? (
          <div className="mb-2">
            <p className="mb-1 text-[10px] font-medium text-rose-200">Conflicts</p>
            <ul className="space-y-1 text-[10px] text-slate-300">
              {result.insights.conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.insights.warnings.length > 0 ? (
          <div className="mb-2">
            <p className="mb-1 text-[10px] font-medium text-slate-400">Warnings</p>
            <ul className="space-y-1 text-[10px] text-slate-400">
              {result.insights.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.insights.suggestions.length > 0 ? (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-cyan-200">
              <Sparkles className="h-3 w-3" />
              Suggestions
            </p>
            <ul className="space-y-1 text-[10px] text-slate-300">
              {result.insights.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

export function NetLensPanel() {
  const panelOpen = useNetLensStore((s) => s.panelOpen);
  const closePanel = useNetLensStore((s) => s.closePanel);
  const requestWorkflowTab = useIpamStore((s) => s.requestWorkflowTab);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<NetLensResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowMsg, setWorkflowMsg] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);

  const { rootRef, position, onDragStart, onDragMove, onDragEnd } = useFloatingPanelDrag({
    storageKey: STORAGE_KEY,
    defaultPosition,
    defaultWidth: PANEL_W,
    defaultHeight: PANEL_H,
    enabled: panelOpen,
  });

  const runAnalysis = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const out = await analyzeNetLens(trimmed);
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const t = window.setTimeout(() => void runAnalysis(input), 280);
    return () => window.clearTimeout(t);
  }, [input, panelOpen, runAnalysis]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel, panelOpen]);

  const submitToWorkflow = useCallback(async () => {
    if (!result?.analysis?.normalizedInput) return;
    setWorkflowBusy(true);
    setWorkflowMsg(null);
    try {
      const address = result.analysis.cidr ?? result.analysis.normalizedInput;
      const recordType = result.inputMode === 'ip' ? 'host' : 'subnet';
      const { workflow } = await createWorkflowRequest({
        address,
        record_type: recordType,
        requester: 'netlens',
        description: 'Submitted from NetLens floating panel',
      });
      await attachWorkflowNetLens(workflow.id, netLensResultToWorkflowPayload(result), 'netlens');
      requestWorkflowTab();
      setWorkflowMsg('Request sent to IP Workflow — open Mini IPAM → IP Workflow.');
    } catch (e) {
      setWorkflowMsg(e instanceof Error ? e.message : 'Could not submit to workflow');
    } finally {
      setWorkflowBusy(false);
    }
  }, [result, requestWorkflowTab]);

  return (
    <AnimatePresence>
      {panelOpen ? (
        <motion.div
          ref={rootRef}
          className={clsx('fixed z-[201] flex w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden', FLOATING_CHROME, FLOATING_PANEL_SHELL)}
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
          aria-label="NetLens IP validation"
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
              <ScanEye className={clsx('h-4 w-4 shrink-0', FLOATING_PANEL_ICON)} strokeWidth={2} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">NetLens</p>
                <p className="truncate text-[9px] text-slate-500">Stateless IP validation · read-only IPAM</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
              aria-label="Close NetLens"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <textarea
              className={clsx(
                'mb-2 min-h-[5.5rem] shrink-0 resize-y rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 font-mono text-xs text-slate-100',
                FLOATING_INPUT_RING,
              )}
              placeholder={PLACEHOLDER}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
            />
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void runAnalysis(input)}
                disabled={loading || !input.trim()}
                className={clsx('inline-flex items-center gap-1.5', FLOATING_PRIMARY_BTN)}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanEye className="h-3.5 w-3.5" />}
                Analyze
              </button>
              {result?.analysis ? (
                <button
                  type="button"
                  onClick={() => void submitToWorkflow()}
                  disabled={workflowBusy || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50"
                >
                  {workflowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Submit to Workflow
                </button>
              ) : null}
              {loading ? <span className="text-[10px] text-slate-500">Inspecting…</span> : null}
            </div>
            {workflowMsg ? <p className="mb-2 text-[10px] text-indigo-300">{workflowMsg}</p> : null}

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/5 bg-gray-900/30 p-2">
              {error ? <p className="text-xs text-rose-300">{error}</p> : null}
              {!error && !result && !loading ? (
                <p className="text-xs text-slate-500">Enter an IP, CIDR, or VLSM preview. Nothing is saved.</p>
              ) : null}
              {result ? <ResultView result={result} /> : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
