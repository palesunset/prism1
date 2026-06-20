import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  computePaths,
  errorDetail,
  exportMonolithic,
  nokiaRsvpNamesForDirection,
} from "../services/apiClient";
import type { SavedLsp } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";
import type { LspReservation, Mode, NokiaCliStyle, RejectedPath } from "../types";

type DemandRow = { source: string; destination: string; bandwidth_mbps: number; name?: string };

function parseCsvDemands(text: string): DemandRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase().split(",").map((s) => s.trim());
  const hasHeader = header.includes("source") && header.includes("destination");
  const start = hasHeader ? 1 : 0;
  const idxSource = hasHeader ? header.indexOf("source") : 0;
  const idxDest = hasHeader ? header.indexOf("destination") : 1;
  const idxBw = hasHeader ? header.indexOf("bandwidth_mbps") : 2;
  const idxName = hasHeader ? header.indexOf("name") : -1;

  const out: DemandRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const source = cols[idxSource] ?? "";
    const destination = cols[idxDest] ?? "";
    const bwRaw = cols[idxBw] ?? "";
    const bw = Number(bwRaw);
    if (!source || !destination || !Number.isFinite(bw) || bw < 0) {
      continue;
    }
    const name = idxName >= 0 ? (cols[idxName] ?? "").trim() : "";
    out.push({ source, destination, bandwidth_mbps: Math.floor(bw), name: name || undefined });
  }
  return out;
}

function formatMode(m: Mode): string {
  if (m === "rsvp_te") return "RSVP-TE";
  if (m === "sr_mpls") return "SR-MPLS";
  return "SRv6";
}

function Accordion(props: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-2 py-2 text-left text-xs font-semibold text-slate-200"
      >
        {props.title}
        <span className="text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="space-y-2 border-t border-white/5 px-2 py-2">{props.children}</div> : null}
    </div>
  );
}

export function PathDetailsSection() {
  const last = useAppStore((s) => s.lastCompute);
  if (!last?.primary) {
    return <div className="text-center text-xs text-slate-500">No LSP computed yet</div>;
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-[11px] font-medium text-cyan-300">Primary</div>
        <p className="break-words font-mono text-[11px] leading-relaxed text-slate-100">
          {last.primary.nodes.join(" → ")}
        </p>
        <p className="mt-1.5 text-xs text-slate-400">
          Total latency:{" "}
          <span className="font-medium tabular-nums text-slate-200">{last.primary.total_latency_ms.toFixed(2)} ms</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Total hops:{" "}
          <span className="font-medium tabular-nums text-slate-200">{last.primary.hop_count}</span>
        </p>
      </div>
      {last.backup ? (
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-orange-300">Backup</div>
          <p className="break-words font-mono text-[11px] leading-relaxed text-slate-100">
            {last.backup.nodes.join(" → ")}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            Total latency:{" "}
            <span className="font-medium tabular-nums text-slate-200">{last.backup.total_latency_ms.toFixed(2)} ms</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Total hops:{" "}
            <span className="font-medium tabular-nums text-slate-200">
              {last.backup.hop_count != null ? last.backup.hop_count : "—"}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function JustificationContent() {
  const last = useAppStore((s) => s.lastCompute);
  const impact = useAppStore((s) => s.impact);
  const lastImport = useAppStore((s) => s.lastImportSummary);
  const title = useMemo(() => {
    if (!last?.primary) {
      return "No path computed yet";
    }
    const p = `Primary: ${last.primary.total_latency_ms.toFixed(2)} ms, ${last.primary.hop_count} hops`;
    const s = last.backup
      ? `Secondary: ${last.backup.total_latency_ms.toFixed(2)} ms, ${last.backup.hop_count} hops`
      : "Secondary: none";
    return `${p}\n${s}`;
  }, [last]);
  const srv6SidInfo = useMemo(() => {
    if (last?.mode !== "srv6" || !last.primary) {
      return null;
    }
    const fullSegments = Math.max(1, last.primary.hop_count);
    const usidCarrier = Math.ceil(fullSegments / 4);
    return { fullSegments, usidCarrier };
  }, [last]);
  return (
    <div className="space-y-2 text-xs text-slate-200">
      {lastImport?.invalid_rows?.length ? (
        <details className="rounded border border-rose-800/50 bg-rose-950/30" open>
          <summary className="cursor-pointer px-2 py-2 text-[11px] font-semibold text-rose-100">
            CSV rows skipped ({lastImport.invalid_rows.length})
          </summary>
          <div className="floating-panel-scroll max-h-32 space-y-1 overflow-y-auto px-2 pb-2 text-[10px] text-rose-50">
            {lastImport.invalid_rows.slice(0, 50).map((r) => (
              <div key={`${r.file}-${r.row}-${r.message}`}>
                <span className="font-mono">
                  {r.file} row {r.row}
                  {r.field ? ` [${r.field}]` : ""}:
                </span>{" "}
                {r.message}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {lastImport?.warnings?.length ? (
        <div className="rounded border border-slate-600 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
          {lastImport.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      ) : null}
      {last ? <div className="whitespace-pre-line text-slate-300">{title}</div> : null}
      {last &&
      last.primary != null &&
      last.backup != null &&
      last.optimal_latency_ms != null &&
      last.tradeoff_applied_ms != null &&
      last.tradeoff_applied_ms > 0.01 ? (
        <div className="rounded border border-cyan-800/40 bg-cyan-950/30 px-2 py-2 text-[11px] text-cyan-50">
          <div className="font-semibold text-cyan-100">Primary path selected (with trade-off)</div>
          <div className="mt-1 text-slate-200">
            Latency: {last.primary.total_latency_ms.toFixed(2)} ms (optimal was {last.optimal_latency_ms.toFixed(2)} ms, +{" "}
            {last.tradeoff_applied_ms.toFixed(2)} ms)
          </div>
        </div>
      ) : null}
      {last && last?.ecmp_paths?.length && last.ecmp_paths.length > 1 ? (
        <div className="rounded border border-violet-700/40 bg-violet-950/30 py-2 pl-2 pr-2 text-[11px] text-violet-100">
          ECMP: {last.ecmp_paths.length} equal-cost path(s). Purple dotted lines are alternates.
        </div>
      ) : null}
      {srv6SidInfo ? (
        <div className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
          <div className="font-semibold text-slate-100">SRv6 segment estimate</div>
          <div>Full SID count: ~{srv6SidInfo.fullSegments}</div>
          <div>uSID blocks (~4 SIDs each): ~{srv6SidInfo.usidCarrier}</div>
        </div>
      ) : null}
      {impact ? (
        <div className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-[11px]">
          <div className="font-semibold text-slate-100">Failure impact (vs baseline)</div>
          <div>Δ latency: {impact.primaryLatencyDeltaMs.toFixed(2)} ms</div>
          <div>Δ hops: {impact.primaryHopDelta}</div>
        </div>
      ) : null}
      {last && last.warnings?.length ? (
        <div className="rounded border border-amber-700/40 bg-amber-950/30 px-2 py-2 text-[11px] text-amber-100">
          {last.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      ) : null}
      {last && last.pruned_edges?.length ? (
        <details className="rounded border border-slate-700 bg-slate-900">
          <summary className="cursor-pointer px-2 py-2 text-[11px]">Pruned links ({last.pruned_edges.length})</summary>
          <div className="space-y-1 px-2 pb-2 text-[11px] text-slate-300">
            {last.pruned_edges.slice(0, 30).map((p) => (
              <div key={`${p.source}|${p.target}|${p.edge_key}`} className="font-mono text-[10px]">
                {p.source}—{p.target}#{p.edge_key}: {p.reason}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function RejectionCard(props: { p: RejectedPath }) {
  const [ex, setEx] = useState(false);
  return (
    <div className="rounded border border-rose-900/40 bg-rose-950/20 p-2 text-[11px]">
      <button type="button" onClick={() => setEx(!ex)} className="w-full text-left text-rose-100/90">
        {props.p.nodes.join(" → ")}
        <div className="text-slate-400">Reason: {props.p.reason}</div>
      </button>
      {ex ? (
        <div className="mt-1 font-mono text-[10px] text-slate-400">Nodes: {props.p.nodes.join(", ")}</div>
      ) : null}
    </div>
  );
}

export function RejectionsList() {
  const last = useAppStore((s) => s.lastCompute);
  if (!last?.rejected_paths?.length) {
    return <div className="text-xs text-slate-500">No rejections for this run.</div>;
  }
  return (
    <div className="space-y-1">
      {last.rejected_paths.map((p, i) => (
        <RejectionCard key={`${i}-${p.reason}`} p={p} />
      ))}
    </div>
  );
}

function SavedLspLine(props: { l: SavedLsp; onSelect: (l: SavedLsp) => void }) {
  return (
    <div className="rounded border border-slate-700/80 bg-slate-900/50 p-2 text-[11px] text-slate-200">
      <div className="flex items-center justify-between gap-1">
        <button type="button" className="min-w-0 font-semibold text-cyan-100 hover:underline" onClick={() => props.onSelect(props.l)}>
          {props.l.name}
        </button>
        <div className="shrink-0 text-slate-500">{formatMode(props.l.mode)}</div>
      </div>
      <div className="text-slate-500">
        {props.l.source} → {props.l.destination} · bw {props.l.requiredBwMbps} Mbps
      </div>
    </div>
  );
}

export function SavedLspsBlock(props: { onLoadLsp: (l: SavedLsp) => void; busy: boolean; onGlobalLoading: (b: boolean) => void }) {
  const lsps = useAppStore((s) => s.lsps);
  const deleteLsp = useAppStore((s) => s.deleteLsp);
  const upsertLsp = useAppStore((s) => s.upsertLsp);
  const setLastCompute = useAppStore((s) => s.setLastCompute);
  const flexAlgoId = useAppStore((s) => s.flexAlgoId);
  const enforceSrlgDiversity = useAppStore((s) => s.enforceSrlgDiversity);
  const enforceRoles = useAppStore((s) => s.enforceRoles);
  const timeHour = useAppStore((s) => s.timeHour);
  const currentMode = useAppStore((s) => s.mode);
  const currentMaxHops = useAppStore((s) => s.maxHops);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);
  const reservations = useAppStore((s) => s.reservations);
  const backupTradeoffEnabled = useAppStore((s) => s.backupTradeoffEnabled);
  const tradeoffMode = useAppStore((s) => s.tradeoffMode);
  const tradeoffValue = useAppStore((s) => s.tradeoffValue);
  const failedNeIds = useAppStore((s) => s.failedNeIds);
  const failedLinkKeys = useAppStore((s) => s.failedLinkKeys);
  const [sel, setSel] = useState("");

  const list = useMemo(
    () => Object.values(lsps).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [lsps],
  );
  const active = list.find((l) => l.name === sel) ?? null;

  const loadLsp = (lsp: SavedLsp) => {
    setSel(lsp.name);
    useAppStore.getState().setLspName(lsp.name);
    useAppStore.getState().setSource(lsp.source);
    useAppStore.getState().setDestination(lsp.destination);
    useAppStore.getState().setMode(lsp.mode);
    useAppStore.getState().setRequiredBw(lsp.requiredBwMbps);
    useAppStore.getState().setMaxHops(lsp.maxHops);
    setLastCompute({
      primary: lsp.primary,
      backup: lsp.backup,
      rejected_paths: [],
      pruned_edges: [],
      warnings: [],
      mode: lsp.mode,
    });
    props.onLoadLsp(lsp);
    toast.success(`Loaded LSP ${lsp.name}`);
  };

  const recomputeSelected = async () => {
    if (!active) {
      return;
    }
    props.onGlobalLoading(true);
    const tv = backupTradeoffEnabled ? tradeoffValue : 0;
    try {
      const res = await computePaths({
        source_ne_id: active.source,
        destination_ne_id: active.destination,
        flex_algo_id: flexAlgoId,
        required_bw_mbps: active.requiredBwMbps > 0 ? active.requiredBwMbps : null,
        max_hops: active.maxHops,
        mode: active.mode,
        time_hour: timeHour,
        enforce_srlg_diversity: enforceSrlgDiversity,
        enforce_roles: enforceRoles,
        failed_ne_ids: failedNeIds,
        failed_link_keys: failedLinkKeys,
        tradeoff_mode: tradeoffMode,
        tradeoff_value: tv,
      });
      const next: SavedLsp = { ...active, primary: res.primary, backup: res.backup, createdAt: new Date().toISOString() };
      upsertLsp(next);
      loadLsp(next);
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      props.onGlobalLoading(false);
    }
  };

  const runMatrix = async (file: File) => {
    props.onGlobalLoading(true);
    try {
      const text = await file.text();
      const demands = parseCsvDemands(text);
      if (demands.length === 0) {
        toast.error("No valid demand rows");
        return;
      }
      let ok = 0;
      for (const d of demands) {
        try {
          const tv = backupTradeoffEnabled ? tradeoffValue : 0;
          const res = await computePaths({
            source_ne_id: d.source,
            destination_ne_id: d.destination,
            flex_algo_id: flexAlgoId,
            required_bw_mbps: d.bandwidth_mbps > 0 ? d.bandwidth_mbps : null,
            max_hops: currentMaxHops,
            mode: currentMode,
            time_hour: timeHour,
            enforce_srlg_diversity: enforceSrlgDiversity,
            enforce_roles: enforceRoles,
            failed_ne_ids: [],
            failed_link_keys: [],
            tradeoff_mode: tradeoffMode,
            tradeoff_value: tv,
          });
          const name = d.name ?? `${d.source}-${d.destination}-${d.bandwidth_mbps}`;
          upsertLsp({
            name,
            source: d.source,
            destination: d.destination,
            mode: currentMode,
            requiredBwMbps: d.bandwidth_mbps,
            maxHops: currentMaxHops,
            primary: res.primary,
            backup: res.backup,
            createdAt: new Date().toISOString(),
          });
          ok += 1;
        } catch {
          // continue
        }
      }
      toast.success(`Traffic matrix: ${ok}/${demands.length} LSPs`);
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      props.onGlobalLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {list.length === 0 ? <div className="text-xs text-slate-500">No saved LSPs yet. Compute to save.</div> : null}
      <div className="floating-panel-scroll max-h-48 space-y-1 overflow-y-auto pr-0.5">
        {list.map((l) => (
          <div
            key={l.name}
            className={sel === l.name ? "rounded border border-cyan-500/40" : "rounded border border-transparent"}
          >
            <div className="flex gap-1">
              <div className="min-w-0 flex-1">
                <SavedLspLine l={l} onSelect={loadLsp} />
              </div>
              <button
                type="button"
                onClick={() => {
                  deleteLsp(l.name);
                  if (sel === l.name) {
                    setSel("");
                  }
                }}
                className="shrink-0 self-start px-1.5 text-[10px] text-rose-300/90 hover:text-rose-200"
              >
                Del
              </button>
            </div>
          </div>
        ))}
      </div>
      {active ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={props.busy}
            onClick={() => void recomputeSelected()}
            className="flex-1 rounded bg-cyan-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            Recompute
          </button>
          <LoadConfigButton active={active} nokia={nokiaCliStyle} res={reservations} flexId={flexAlgoId} />
        </div>
      ) : null}
      <div className="rounded border border-slate-700/80 p-2">
        <div className="text-[10px] text-slate-500">CSV: source,destination,bandwidth_mbps [,name]</div>
        <label className="mt-1 block">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void runMatrix(f);
              }
              e.target.value = "";
            }}
          />
          <span className="block cursor-pointer rounded border border-slate-600 bg-slate-800/80 py-1.5 text-center text-[11px] text-slate-200 hover:bg-slate-800">
            Traffic matrix…
          </span>
        </label>
      </div>
    </div>
  );
}

function LoadConfigButton(props: {
  active: SavedLsp;
  nokia: NokiaCliStyle;
  res: LspReservation[];
  flexId: number | null;
}) {
  const [b, setB] = useState(false);
  const nxF = useAppStore((s) => s.nokiaRsvpLabelXForward);
  const nyF = useAppStore((s) => s.nokiaRsvpLabelYForward);
  const nzF = useAppStore((s) => s.nokiaRsvpLabelZForward);
  const nxR = useAppStore((s) => s.nokiaRsvpLabelXReverse);
  const nyR = useAppStore((s) => s.nokiaRsvpLabelYReverse);
  const nzR = useAppStore((s) => s.nokiaRsvpLabelZReverse);
  return (
    <button
      type="button"
      disabled={!props.active.primary || b}
      onClick={async () => {
        if (!props.active.primary) {
          return;
        }
        setB(true);
        try {
          const text = await exportMonolithic({
            lsp_name: props.active.name,
            mode: props.active.mode,
            flex_algo_id: props.flexId,
            primary: props.active.primary,
            backup: props.active.backup,
            reservations: props.res,
            nokia_cli_style: props.nokia,
            ...nokiaRsvpNamesForDirection("forward", nxF, nyF, nzF),
            ...nokiaRsvpNamesForDirection("reverse", nxR, nyR, nzR),
          });
          useAppStore.getState().setMonolithicConfig(text);
          useAppStore.getState().setConfigOverlayOpen(true);
        } catch (err) {
          toast.error(errorDetail(err));
        } finally {
          setB(false);
        }
      }}
      className="flex-1 rounded border border-slate-600 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
    >
      {b ? "…" : "View cfg"}
    </button>
  );
}

export function LspDetailsTab(props: {
  busy: boolean;
  onGlobalLoading: (b: boolean) => void;
  onLoadLsp: (l: SavedLsp) => void;
}) {
  return (
    <div className="space-y-3 p-3">
      <Accordion title="Path Details" defaultOpen>
        <PathDetailsSection />
      </Accordion>
      <Accordion title="Justification" defaultOpen>
        <JustificationContent />
        <div className="pt-2">
          <div className="mb-1 text-[11px] text-slate-500">Role / CSPF rejections</div>
          <RejectionsList />
        </div>
      </Accordion>
      <Accordion title="Saved LSPs">
        <SavedLspsBlock
          onLoadLsp={props.onLoadLsp}
          busy={props.busy}
          onGlobalLoading={props.onGlobalLoading}
        />
      </Accordion>
    </div>
  );
}
