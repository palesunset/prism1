import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { computePaths, errorDetail, exportMonolithic } from "../services/apiClient";
import { useAppStore } from "../store/useAppStore";
import type { SavedLsp } from "../store/useAppStore";
import type { Mode } from "../types";
import { useEffect, useState } from "react";

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

export function LspSidebar() {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const lsps = useAppStore((s) => s.lsps);
  const deleteLsp = useAppStore((s) => s.deleteLsp);
  const upsertLsp = useAppStore((s) => s.upsertLsp);
  const setLastCompute = useAppStore((s) => s.setLastCompute);
  const setSource = useAppStore((s) => s.setSource);
  const setDestination = useAppStore((s) => s.setDestination);
  const setMode = useAppStore((s) => s.setMode);
  const setRequiredBw = useAppStore((s) => s.setRequiredBw);
  const setMaxHops = useAppStore((s) => s.setMaxHops);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);
  const reservations = useAppStore((s) => s.reservations);
  const currentMode = useAppStore((s) => s.mode);
  const currentMaxHops = useAppStore((s) => s.maxHops);
  const timeHour = useAppStore((s) => s.timeHour);
  const flexAlgoId = useAppStore((s) => s.flexAlgoId);
  const enforceSrlgDiversity = useAppStore((s) => s.enforceSrlgDiversity);
  const enforceRoles = useAppStore((s) => s.enforceRoles);
  const [activeConfig, setActiveConfig] = useState<string | null>(null);
  const [activeConfigBusy, setActiveConfigBusy] = useState(false);
  const [activeConfigErr, setActiveConfigErr] = useState<string | null>(null);

  useEffect(() => {
    // Clear cached config when selection changes
    setActiveConfig(null);
    setActiveConfigErr(null);
    setActiveConfigBusy(false);
  }, [selected]);

  const list = useMemo(() => Object.values(lsps).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [lsps]);
  const active = list.find((l) => l.name === selected) ?? null;

  const totals = useMemo(() => {
    return list.map((l) => ({
      name: l.name,
      pLatency: l.primary?.total_latency_ms ?? null,
      pHops: l.primary?.hop_count ?? null,
      sLatency: l.backup?.total_latency_ms ?? null,
      sHops: l.backup?.hop_count ?? null,
      bw: l.requiredBwMbps,
      mode: l.mode,
    }));
  }, [list]);

  function loadLsp(lsp: SavedLsp) {
    setSelected(lsp.name);
    setSource(lsp.source);
    setDestination(lsp.destination);
    setMode(lsp.mode);
    setRequiredBw(lsp.requiredBwMbps);
    setMaxHops(lsp.maxHops);
    setLastCompute({
      primary: lsp.primary,
      backup: lsp.backup,
      rejected_paths: [],
      pruned_edges: [],
      warnings: [],
      mode: lsp.mode,
    });
    toast.success(`Loaded LSP ${lsp.name}`);
  }

  async function recomputeSelected() {
    if (!active) return;
    setBusy(true);
    try {
      const res = await computePaths({
        source_ne_id: active.source,
        destination_ne_id: active.destination,
        flex_algo_id: flexAlgoId,
        required_bw_mbps: active.requiredBwMbps > 0 ? active.requiredBwMbps : null,
        max_hops: active.maxHops,
        mode: active.mode,
        enforce_srlg_diversity: enforceSrlgDiversity,
        enforce_roles: enforceRoles,
        failed_ne_ids: [],
        failed_link_keys: [],
      });
      const next: SavedLsp = {
        ...active,
        primary: res.primary,
        backup: res.backup,
        createdAt: new Date().toISOString(),
      };
      upsertLsp(next);
      loadLsp(next);
      toast.success("Recomputed");
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      setBusy(false);
    }
  }

  async function runTrafficMatrix(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const demands = parseCsvDemands(text);
      if (demands.length === 0) {
        toast.error("No valid demand rows found");
        return;
      }
      toast(`Designing ${demands.length} LSPs…`, { duration: 4000 });
      let ok = 0;
      for (const d of demands) {
        try {
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
          // keep going
        }
      }
      toast.success(`Traffic matrix done: ${ok}/${demands.length} computed`);
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute right-3 top-3 z-40 flex items-start gap-0">
      {!open ? (
        <button
          type="button"
          className="ml-1 rounded-l-lg border border-slate-600 bg-[#1E293B] px-2 py-8 text-xs font-semibold leading-tight text-slate-100 shadow-lg hover:bg-slate-800"
          onClick={() => setOpen(true)}
          title="Show LSP list"
        >
          <span className="block max-w-[2.5rem] break-words">LSPs</span>
          <span className="mt-1 block text-cyan-400">◀</span>
        </button>
      ) : null}

      <aside className={`w-[420px] max-w-[calc(100vw-24px)] rounded-lg border border-slate-700 bg-[#1E293B] shadow-xl ${open ? "" : "hidden"}`}>
        <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
          <div className="text-sm font-semibold text-slate-100">Multi-LSP</div>
          <button type="button" className="text-xs text-slate-300 hover:text-white" onClick={() => setOpen(false)}>
            Hide
          </button>
        </div>
        <div className="panel-scroll max-h-[45vh] overflow-auto px-3 py-3 text-sm text-slate-200">
          {list.length === 0 ? (
            <div className="text-xs text-slate-400">No saved LSPs yet. Compute one and it will be saved here.</div>
          ) : (
            <div className="space-y-2">
              {list.map((l) => (
                <div
                  key={l.name}
                  className={`rounded border px-2 py-2 ${selected === l.name ? "border-cyan-600 bg-slate-900" : "border-slate-700 bg-slate-900/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left text-xs font-semibold text-slate-100 hover:underline"
                      onClick={() => loadLsp(l)}
                    >
                      {l.name}
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-rose-300 hover:text-rose-200"
                      onClick={() => {
                        deleteLsp(l.name);
                        if (selected === l.name) setSelected("");
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {l.source} → {l.destination} • {formatMode(l.mode)} • bw {l.requiredBwMbps} • maxHops {l.maxHops}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-300">
                    {l.primary ? (
                      <>
                        <div>
                          Primary: {l.primary.total_latency_ms.toFixed(2)} ms • {l.primary.hop_count} hops
                        </div>
                        <div className="text-slate-400">
                          {l.backup ? (
                            <>
                              Secondary: {l.backup.total_latency_ms.toFixed(2)} ms • {l.backup.hop_count} hops
                            </>
                          ) : (
                            "Secondary: none"
                          )}
                        </div>
                      </>
                    ) : (
                      "No primary path"
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {active ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void recomputeSelected()}
                className="flex-1 rounded bg-cyan-700 px-2 py-2 text-xs font-semibold text-white hover:bg-cyan-600 disabled:opacity-40"
              >
                {busy ? "Recomputing…" : "Recompute"}
              </button>
              <button
                type="button"
                disabled={!active.primary || activeConfigBusy}
                onClick={async () => {
                  if (!active.primary) return;
                  setActiveConfigBusy(true);
                  setActiveConfigErr(null);
                  try {
                    const text = await exportMonolithic({
                      lsp_name: active.name,
                      mode: active.mode,
                      flex_algo_id: flexAlgoId,
                      primary: active.primary,
                      backup: active.backup,
                      reservations,
                      nokia_cli_style: nokiaCliStyle,
                    });
                    setActiveConfig(text);
                  } catch (err) {
                    setActiveConfig(null);
                    setActiveConfigErr(errorDetail(err));
                  } finally {
                    setActiveConfigBusy(false);
                  }
                }}
                className="flex-1 rounded border border-slate-600 px-2 py-2 text-xs hover:bg-slate-800 disabled:opacity-40"
              >
                {activeConfigBusy ? "Loading…" : "Show config output"}
              </button>
            </div>
          ) : null}

          {active ? (
            <details className="mt-3 rounded border border-slate-700 bg-slate-900" open={Boolean(activeConfig)}>
              <summary className="cursor-pointer px-2 py-2 text-xs text-slate-200">Config output (monolithic)</summary>
              <div className="space-y-2 px-2 pb-2">
                {!active.primary ? (
                  <div className="text-[11px] text-slate-400">Compute or select an LSP with a primary path.</div>
                ) : null}
                {activeConfigErr ? <div className="text-[11px] text-rose-300">{activeConfigErr}</div> : null}
                {activeConfig ? (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded bg-cyan-700 px-2 py-2 text-xs font-semibold text-white hover:bg-cyan-600"
                        onClick={async () => {
                          await navigator.clipboard.writeText(activeConfig);
                          toast.success("Config copied");
                        }}
                      >
                        Copy config
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-100 hover:bg-slate-700"
                        onClick={() => setActiveConfig(null)}
                      >
                        Clear
                      </button>
                    </div>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950 p-3 text-[11px] text-green-300">
                      {activeConfig}
                    </pre>
                  </>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    Click <span className="text-slate-200 font-semibold">Show config output</span> to load the legacy monolithic config for the selected LSP.
                  </div>
                )}
              </div>
            </details>
          ) : null}

          {list.length ? (
            <details className="mt-4 rounded border border-slate-700 bg-slate-900" open>
              <summary className="cursor-pointer px-2 py-2 text-xs text-slate-200">Path comparison</summary>
              <div className="panel-scroll overflow-auto px-2 pb-2">
                <table className="w-full table-fixed text-[11px] text-slate-200 [font-variant-numeric:tabular-nums]">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="w-[88px] py-1 text-left">Name</th>
                      <th className="w-[72px] py-1 text-left">Mode</th>
                      <th className="w-[68px] py-1 text-right">P Lat</th>
                      <th className="w-[44px] py-1 text-right">P Hops</th>
                      <th className="w-[68px] py-1 text-right">S Lat</th>
                      <th className="w-[44px] py-1 text-right">S Hops</th>
                      <th className="w-[36px] py-1 text-right">BW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((t) => (
                      <tr key={t.name} className="border-t border-slate-800">
                        <td className="truncate py-1">
                          <button type="button" className="hover:underline" onClick={() => loadLsp(lsps[t.name])}>
                            {t.name}
                          </button>
                        </td>
                        <td className="truncate py-1">{formatMode(t.mode)}</td>
                        <td className="whitespace-nowrap py-1 text-right">{t.pLatency === null ? "—" : `${t.pLatency.toFixed(2)} ms`}</td>
                        <td className="py-1 text-right">{t.pHops === null ? "—" : t.pHops}</td>
                        <td className="whitespace-nowrap py-1 text-right">{t.sLatency === null ? "—" : `${t.sLatency.toFixed(2)} ms`}</td>
                        <td className="py-1 text-right">{t.sHops === null ? "—" : t.sHops}</td>
                        <td className="py-1 text-right">{t.bw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          <details className="mt-4 rounded border border-slate-700 bg-slate-900">
            <summary className="cursor-pointer px-2 py-2 text-xs text-slate-200">Traffic matrix import</summary>
            <div className="space-y-2 px-2 pb-2 text-[11px] text-slate-300">
              <div>
                Upload CSV with columns: <span className="font-mono">source,destination,bandwidth_mbps</span> (optional{" "}
                <span className="font-mono">name</span>). Uses current Mode and Max Hops.
              </div>
              <label className="block">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void runTrafficMatrix(f);
                    e.target.value = "";
                  }}
                />
                <span className="block cursor-pointer rounded border border-slate-700 bg-slate-800 px-2 py-2 text-center text-xs text-slate-100 hover:bg-slate-700">
                  Upload traffic matrix CSV…
                </span>
              </label>
            </div>
          </details>

        </div>
      </aside>
    </div>
  );
}

