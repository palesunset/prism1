import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { computePaths, errorDetail, exportClipboard, exportZip, importTopology } from "../services/apiClient";
import type { Mode, NokiaCliStyle } from "../types";
import { useAppStore } from "../store/useAppStore";

export function ControlPanel(props: {
  onImported: () => Promise<void> | void;
  onComputed: () => Promise<void> | void;
  onGlobalLoading: (v: boolean) => void;
  fileInputId?: string;
  onSaveProject: () => void;
  onOpenProject: (file: File) => void;
  onLoadSample: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const lspName = useAppStore((s) => s.lspName);
  const setLspName = useAppStore((s) => s.setLspName);
  const neIds = useAppStore((s) => s.neIds);
  const source = useAppStore((s) => s.source);
  const destination = useAppStore((s) => s.destination);
  const requiredBw = useAppStore((s) => s.requiredBwMbps);
  const maxHops = useAppStore((s) => s.maxHops);
  const mode = useAppStore((s) => s.mode);
  const flexAlgoId = useAppStore((s) => s.flexAlgoId);
  const flexAlgos = useAppStore((s) => s.flexAlgos);
  const enforceSrlgDiversity = useAppStore((s) => s.enforceSrlgDiversity);
  const lastCompute = useAppStore((s) => s.lastCompute);
  const failedNeIds = useAppStore((s) => s.failedNeIds);
  const failedLinkKeys = useAppStore((s) => s.failedLinkKeys);
  const heatmapEnabled = useAppStore((s) => s.heatmapEnabled);
  const reservations = useAppStore((s) => s.reservations);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);
  const timeHour = useAppStore((s) => s.timeHour);
  const setSource = useAppStore((s) => s.setSource);
  const setDestination = useAppStore((s) => s.setDestination);
  const setRequiredBw = useAppStore((s) => s.setRequiredBw);
  const setMaxHops = useAppStore((s) => s.setMaxHops);
  const setMode = useAppStore((s) => s.setMode);
  const setFlexAlgoId = useAppStore((s) => s.setFlexAlgoId);
  const setEnforceSrlgDiversity = useAppStore((s) => s.setEnforceSrlgDiversity);
  const setLastCompute = useAppStore((s) => s.setLastCompute);
  const setBaselinePrimary = useAppStore((s) => s.setBaselinePrimary);
  const setImpact = useAppStore((s) => s.setImpact);
  const setReservations = useAppStore((s) => s.setReservations);
  const setLastImportSummary = useAppStore((s) => s.setLastImportSummary);
  const setNokiaCliStyle = useAppStore((s) => s.setNokiaCliStyle);
  const setTimeHour = useAppStore((s) => s.setTimeHour);
  const upsertLsp = useAppStore((s) => s.upsertLsp);
  const toggleHeatmap = useAppStore((s) => s.toggleHeatmap);
  const clearFailures = useAppStore((s) => s.clearFailures);

  const modeButtons: Mode[] = useMemo(() => ["rsvp_te", "sr_mpls", "srv6"], []);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const onCompute = () => void onCompute();
    window.addEventListener("lsp:compute", onCompute);
    return () => window.removeEventListener("lsp:compute", onCompute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, destination, requiredBw, maxHops, mode, failedNeIds, failedLinkKeys, lspName, nokiaCliStyle]);

  async function onPickCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length < 2) {
      return;
    }
    const list = Array.from(files);
    const nes = list.find((f) => f.name.toLowerCase().includes("nes")) ?? list[0];
    const links = list.find((f) => f.name.toLowerCase().includes("link")) ?? list[1];
    props.onGlobalLoading(true);
    setBusy(true);
    try {
      const summary = await importTopology({ nes, links });
      setLastImportSummary(summary);
      toast.success(`Imported ${summary.ne_count} NEs, ${summary.link_count} links`);
      if (summary.invalid_rows?.length) {
        toast(`${summary.invalid_rows.length} row(s) skipped — see Justification panel`, { duration: 6000 });
      }
      await props.onImported();
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      setBusy(false);
      props.onGlobalLoading(false);
      e.target.value = "";
    }
  }

  async function onCompute() {
    props.onGlobalLoading(true);
    setBusy(true);
    try {
      const res = await computePaths({
        source_ne_id: source,
        destination_ne_id: destination,
        flex_algo_id: flexAlgoId,
        required_bw_mbps: requiredBw > 0 ? requiredBw : null,
        max_hops: maxHops,
        mode,
        enforce_srlg_diversity: enforceSrlgDiversity,
        time_hour: timeHour,
        failed_ne_ids: failedNeIds,
        failed_link_keys: failedLinkKeys,
      });
      setLastCompute(res);
      if (failedNeIds.length === 0 && failedLinkKeys.length === 0) {
        setBaselinePrimary(res.primary);
        setImpact(null);
      }
      if (res.primary) {
        const next = [
          ...reservations.filter((r) => r.name !== lspName),
          {
            name: lspName,
            primary_edges: res.primary.edges,
            required_bw_mbps: requiredBw > 0 ? requiredBw : 100,
          },
        ];
        setReservations(next);
      }
      upsertLsp({
        name: lspName,
        source,
        destination,
        mode,
        requiredBwMbps: requiredBw,
        maxHops,
        primary: res.primary,
        backup: res.backup,
        createdAt: new Date().toISOString(),
      });
      await props.onComputed();
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      setBusy(false);
      props.onGlobalLoading(false);
    }
  }

  async function onCopy() {
    if (!lastCompute?.primary) {
      return;
    }
    try {
      const text = await exportClipboard({
        lsp_name: lspName,
        mode,
        flex_algo_id: flexAlgoId,
        primary: lastCompute.primary,
        backup: lastCompute.backup,
        reservations,
        nokia_cli_style: nokiaCliStyle,
      });
      await navigator.clipboard.writeText(text);
      toast.success("Ingress configuration copied");
    } catch (err) {
      toast.error(errorDetail(err));
    }
  }

  async function onDownloadZip() {
    if (!lastCompute?.primary) {
      return;
    }
    try {
      const blob = await exportZip({
        lsp_name: lspName,
        mode,
        flex_algo_id: flexAlgoId,
        primary: lastCompute.primary,
        backup: lastCompute.backup,
        reservations,
        nokia_cli_style: nokiaCliStyle,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${lspName}_configs.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP download started");
    } catch (err) {
      toast.error(errorDetail(err));
    }
  }

  const nokiaOptions: NokiaCliStyle[] = ["classic", "md"];
  const filteredNeIds = filter
    ? neIds.filter((id) => id.toLowerCase().includes(filter.toLowerCase()))
    : neIds;

  return (
    <div className="absolute left-3 top-3 z-40 flex items-start gap-0">
      {!open ? (
        <button
          type="button"
          className="mr-1 rounded-r-lg border border-slate-600 bg-[#1E293B] px-2 py-8 text-xs font-semibold leading-tight text-slate-100 shadow-lg hover:bg-slate-800"
          onClick={() => setOpen(true)}
          title="Show Constraints panel"
        >
          <span className="block max-w-[2.5rem] break-words">Constraints</span>
          <span className="mt-1 block text-cyan-400">▶</span>
        </button>
      ) : null}

      <aside
        className={`rounded-lg border border-slate-700 bg-[#1E293B] shadow-xl ${
          open ? "w-[340px]" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
          <div className="text-sm font-semibold text-slate-100">Constraints</div>
          <button
            type="button"
            className="text-xs text-slate-300 hover:text-white"
            onClick={() => setOpen(false)}
            title="Hide panel"
          >
            Hide
          </button>
        </div>
        {open ? (
          <div className="panel-scroll max-h-[calc(100vh-96px)] overflow-auto px-3 py-3 text-sm text-slate-200" style={{ direction: "rtl" }}>
            <div className="space-y-3" style={{ direction: "ltr" }}>
            <div>
              <div className="mb-1 text-xs text-slate-400">Import CSV</div>
              <input
                id={props.fileInputId}
                className="hidden"
                type="file"
                accept=".csv,text/csv"
                multiple
                onChange={(e) => void onPickCsv(e)}
              />
              <button
                type="button"
                onClick={() => props.fileInputId && document.getElementById(props.fileInputId)?.click()}
                className="mt-2 w-full rounded border border-slate-600 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Browse…
              </button>
              <button
                type="button"
                onClick={() => props.onLoadSample()}
                className="mt-2 w-full rounded border border-slate-600 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Load sample topology
              </button>
            </div>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Search NE (Ctrl/Cmd+K)</div>
              <input
                id="ne-search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Type to filter NE list…"
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Nokia export CLI style</div>
              <select
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
                value={nokiaCliStyle}
                onChange={(e) => setNokiaCliStyle(e.target.value as NokiaCliStyle)}
              >
                {nokiaOptions.map((o) => (
                  <option key={o} value={o}>
                    {o === "md" ? "MD-CLI" : "Classic"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Source NE</div>
              <select
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">Select…</option>
                {filteredNeIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Destination NE</div>
              <select
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">Select…</option>
                {filteredNeIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Required Bandwidth (Mbps)</div>
              <input
                type="range"
                min={0}
                max={100000}
                step={100}
                value={requiredBw}
                onChange={(e) => setRequiredBw(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-slate-400">{requiredBw} Mbps (0 = ignore)</div>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Time (hour 0–23)</div>
              <input
                type="range"
                min={0}
                max={23}
                step={1}
                value={timeHour}
                onChange={(e) => setTimeHour(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-slate-400">Hour: {timeHour}</div>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Max Hops</div>
              <input
                type="range"
                min={1}
                max={64}
                step={1}
                value={maxHops}
                onChange={(e) => setMaxHops(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-slate-400">{maxHops}</div>
            </label>

            <div>
              <div className="mb-1 text-xs text-slate-400">Mode</div>
              <div className="flex gap-1">
                {modeButtons.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded px-2 py-1 text-xs ${
                      mode === m ? "bg-cyan-600 text-white" : "bg-slate-900 text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Flex‑Algo (SR)</div>
              <select
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
                value={flexAlgoId === null ? "" : String(flexAlgoId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setFlexAlgoId(v ? Number(v) : null);
                }}
              >
                <option value="">Default (IGP)</option>
                {Object.values(flexAlgos)
                  .sort((a, b) => a.id - b.id)
                  .map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name} ({d.id})
                    </option>
                  ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-400">
                Selecting a profile auto-fills Min BW/Max Hops and SRLG-diverse backup behavior.
              </div>
            </label>

            <label className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900 px-2 py-2 text-xs">
              <div>
                <div className="font-semibold text-slate-200">Exclude SRLG (backup diversity)</div>
                <div className="text-[11px] text-slate-400">Avoid SRLGs used by the primary when finding backup.</div>
              </div>
              <input
                type="checkbox"
                checked={enforceSrlgDiversity}
                onChange={(e) => setEnforceSrlgDiversity(e.target.checked)}
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">LSP Name</div>
              <input
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
                value={lspName}
                onChange={(e) => setLspName(e.target.value)}
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !source || !destination}
                onClick={() => void onCompute()}
                className="flex-1 rounded bg-cyan-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Computing…" : "Compute LSP"}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFailures();
                  setBaselinePrimary(null);
                  setImpact(null);
                }}
                className="rounded border border-slate-600 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Reset failures
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => props.onSaveProject()}
                className="flex-1 rounded border border-slate-600 px-2 py-2 text-xs hover:bg-slate-800"
              >
                Save project
              </button>
              <label className="flex-1">
                <input
                  type="file"
                  accept=".lsp.json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      props.onOpenProject(f);
                      e.target.value = "";
                    }
                  }}
                />
                <span className="block cursor-pointer rounded border border-slate-600 px-2 py-2 text-center text-xs hover:bg-slate-800">
                  Open project
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">Utilization heatmap</div>
              <button
                type="button"
                onClick={() => toggleHeatmap()}
                className={`rounded px-2 py-1 text-xs ${heatmapEnabled ? "bg-emerald-700" : "bg-slate-900"}`}
              >
                {heatmapEnabled ? "On" : "Off"}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={!lastCompute?.primary}
                onClick={() => void onCopy()}
                className="flex-1 rounded border border-slate-600 px-2 py-2 text-xs hover:bg-slate-800 disabled:opacity-40"
              >
                Copy ingress cfg
              </button>
              <button
                type="button"
                disabled={!lastCompute?.primary}
                onClick={() => void onDownloadZip()}
                className="flex-1 rounded border border-slate-600 px-2 py-2 text-xs hover:bg-slate-800 disabled:opacity-40"
              >
                Download ZIP
              </button>
            </div>
          </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
