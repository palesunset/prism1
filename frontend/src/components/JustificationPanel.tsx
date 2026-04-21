import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";

export function JustificationPanel() {
  const [open, setOpen] = useState(true);
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
    return `${p} • ${s}`;
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
    <div className="fixed bottom-3 right-3 z-40 flex max-w-[calc(100vw-24px)] items-end gap-0">
      {!open ? (
        <button
          type="button"
          className="mb-0 ml-1 rounded-l-lg border border-slate-600 bg-[#1E293B] px-2 py-8 text-xs font-semibold leading-tight text-slate-100 shadow-lg hover:bg-slate-800"
          onClick={() => setOpen(true)}
          title="Show Justification panel"
        >
          <span className="block max-w-[2.5rem] break-words">Justify</span>
          <span className="mt-1 block text-cyan-400">▶</span>
        </button>
      ) : null}

      <aside className={`w-[420px] max-w-[calc(100vw-24px)] rounded-lg border border-slate-700 bg-[#1E293B] shadow-xl ${open ? "" : "hidden"}`}>
        <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
          <div className="text-sm font-semibold text-slate-100">Justification</div>
          <button type="button" className="text-xs text-slate-300 hover:text-white" onClick={() => setOpen(false)}>
            Hide
          </button>
        </div>
        {open ? (
          <div className="panel-scroll max-h-[45vh] space-y-2 overflow-auto px-3 py-3 text-sm text-slate-200">
            {lastImport?.invalid_rows?.length ? (
              <details className="rounded border border-rose-800/50 bg-rose-950/30" open>
                <summary className="cursor-pointer px-2 py-2 text-xs font-semibold text-rose-100">
                  CSV rows skipped ({lastImport.invalid_rows.length})
                </summary>
                <div className="panel-scroll max-h-40 space-y-1 overflow-auto px-2 pb-2 text-[11px] text-rose-50">
                  {lastImport.invalid_rows.slice(0, 80).map((r) => (
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

            <div className="text-xs text-slate-300">{title}</div>
            {last?.ecmp_paths?.length && last.ecmp_paths.length > 1 ? (
              <div className="rounded border border-violet-700/40 bg-violet-950/30 px-2 py-2 text-[11px] text-violet-100">
                ECMP detected: {last.ecmp_paths.length} equal-cost path(s). Purple dotted lines show alternates.
              </div>
            ) : null}
            {srv6SidInfo ? (
              <div className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] text-slate-300">
                <div className="font-semibold text-slate-100">SRv6 segment estimate</div>
                <div>Full SID count (segments): ~{srv6SidInfo.fullSegments}</div>
                <div>
                  Carrier uSID compressed (est. blocks of 4): ~{srv6SidInfo.usidCarrier} — illustrative; depends on
                  locator, uSID block size, and compression policy.
                </div>
              </div>
            ) : null}

            {impact ? (
              <div className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200">
                <div className="font-semibold text-slate-100">Failure impact (vs baseline)</div>
                <div>Δ latency: {impact.primaryLatencyDeltaMs.toFixed(2)} ms</div>
                <div>Δ hops: {impact.primaryHopDelta}</div>
              </div>
            ) : null}
            {last?.warnings?.length ? (
              <div className="rounded border border-amber-700/40 bg-amber-950/30 px-2 py-2 text-xs text-amber-100">
                {last.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            ) : null}
            {last?.primary ? (
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">Primary nodes</div>
                <div className="font-mono text-xs text-slate-200">{last.primary.nodes.join(" → ")}</div>
              </div>
            ) : null}
            {last?.primary ? (
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">Secondary</div>
                {last.backup ? (
                  <div className="font-mono text-xs text-slate-200">{last.backup.nodes.join(" → ")}</div>
                ) : (
                  <div className="text-xs text-slate-400">None (no strict disjoint backup found)</div>
                )}
              </div>
            ) : null}
            {last?.pruned_edges?.length ? (
              <details className="rounded border border-slate-700 bg-slate-900">
                <summary className="cursor-pointer px-2 py-2 text-xs text-slate-200">
                  Pruned links ({last.pruned_edges.length})
                </summary>
                <div className="space-y-2 px-2 pb-2 text-xs text-slate-300">
                  {last.pruned_edges.slice(0, 50).map((p) => (
                    <div key={`${p.source}|${p.target}|${p.edge_key}`}>
                      <span className="font-mono">
                        {p.source}—{p.target}#{p.edge_key}
                      </span>
                      : {p.reason}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {last?.rejected_paths?.length ? (
              <details className="rounded border border-slate-700 bg-slate-900">
                <summary className="cursor-pointer px-2 py-2 text-xs text-slate-200">
                  Rejected alternatives ({last.rejected_paths.length})
                </summary>
                <div className="space-y-2 px-2 pb-2 text-xs text-slate-300">
                  {last.rejected_paths.map((r, idx) => (
                    <div key={`${idx}-${r.reason}`}>
                      <div className="font-mono text-[11px] text-slate-400">{r.nodes.join(" → ")}</div>
                      <div>{r.reason}</div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
