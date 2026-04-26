import { Menu, X } from "lucide-react";
import toast from "react-hot-toast";
import { importTopology, errorDetail } from "../services/apiClient";
import type { NokiaCliStyle } from "../types";
import { useAppStore } from "../store/useAppStore";
import type { SavedLsp } from "../store/useAppStore";
import { LspDetailsTab } from "./LspPanelSections";
import { TrafficPanel } from "./TrafficPanel";

const PRESET_ALGO = new Set([128, 129, 130]);

export function FloatingPanel(props: {
  fileInputId: string;
  globalBusy: boolean;
  onGlobalLoading: (v: boolean) => void;
  onImported: () => Promise<void> | void;
  onLoadLspFromList: (l: SavedLsp) => void;
  onSaveProject: () => void;
  onOpenProject: (f: File) => void;
}) {
  const open = useAppStore((s) => s.floatingPanelOpen);
  const setOpen = useAppStore((s) => s.setFloatingPanelOpen);
  const tab = useAppStore((s) => s.activePanelTab);
  const setTab = useAppStore((s) => s.setActivePanelTab);
  const workspaceMode = useAppStore((s) => s.workspaceMode);
  const requiredBw = useAppStore((s) => s.requiredBwMbps);
  const setRequiredBw = useAppStore((s) => s.setRequiredBw);
  const maxHops = useAppStore((s) => s.maxHops);
  const setMaxHops = useAppStore((s) => s.setMaxHops);
  const enforceRoles = useAppStore((s) => s.enforceRoles);
  const setEnforceRoles = useAppStore((s) => s.setEnforceRoles);
  const backupTradeoffEnabled = useAppStore((s) => s.backupTradeoffEnabled);
  const setBackupTradeoffEnabled = useAppStore((s) => s.setBackupTradeoffEnabled);
  const tradeoffValue = useAppStore((s) => s.tradeoffValue);
  const setTradeoffValue = useAppStore((s) => s.setTradeoffValue);
  const setTradeoffMode = useAppStore((s) => s.setTradeoffMode);
  const flexAlgoId = useAppStore((s) => s.flexAlgoId);
  const setFlexAlgoId = useAppStore((s) => s.setFlexAlgoId);
  const flexAlgos = useAppStore((s) => s.flexAlgos);
  const enforceSrlgDiversity = useAppStore((s) => s.enforceSrlgDiversity);
  const setEnforceSrlgDiversity = useAppStore((s) => s.setEnforceSrlgDiversity);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);
  const setNokiaCliStyle = useAppStore((s) => s.setNokiaCliStyle);
  const timeHour = useAppStore((s) => s.timeHour);
  const setTimeHour = useAppStore((s) => s.setTimeHour);
  const lastCompute = useAppStore((s) => s.lastCompute);
  const clearFailures = useAppStore((s) => s.clearFailures);
  const setBaselinePrimary = useAppStore((s) => s.setBaselinePrimary);
  const setImpact = useAppStore((s) => s.setImpact);
  const setLastImportSummary = useAppStore((s) => s.setLastImportSummary);
  const lspName = useAppStore((s) => s.lspName);
  const setLspName = useAppStore((s) => s.setLspName);
  const nokiaOptions: NokiaCliStyle[] = ["classic", "md"];
  const presetValue =
    flexAlgoId != null && PRESET_ALGO.has(flexAlgoId) ? String(flexAlgoId) : flexAlgoId == null ? "igp" : "custom";

  async function onPickCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length < 2) {
      return;
    }
    const list = Array.from(files);
    const nes = list.find((f) => f.name.toLowerCase().includes("nes")) ?? list[0];
    const links = list.find((f) => f.name.toLowerCase().includes("link")) ?? list[1];
    props.onGlobalLoading(true);
    try {
      const summary = await importTopology({ nes, links });
      setLastImportSummary(summary);
      toast.success(`Imported ${summary.ne_count} NEs, ${summary.link_count} links`);
      if (summary.invalid_rows?.length) {
        toast(`${summary.invalid_rows.length} row(s) skipped — see LSP Details`, { duration: 6000 });
      }
      await props.onImported();
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      props.onGlobalLoading(false);
      e.target.value = "";
    }
  }

  function resetDefaults() {
    setRequiredBw(0);
    setMaxHops(50);
    setEnforceRoles(true);
    setBackupTradeoffEnabled(true);
    setTradeoffMode("percent");
    setTradeoffValue(50);
    setFlexAlgoId(null);
    setEnforceSrlgDiversity(true);
  }

  if (!open) {
    return (
      <div className="absolute left-2 top-2 z-30">
        <button
          type="button"
          title="Open panel"
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-md bg-cyan-600 text-white shadow-lg transition-all duration-300 hover:bg-cyan-500"
        >
          <Menu size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute left-2 top-2 z-30 w-[280px] max-h-[calc(100dvh-6.5rem)] overflow-hidden rounded-md border border-white/10 bg-gray-900/80 shadow-2xl backdrop-blur-xl transition-all duration-300">
      <div className="flex min-h-0 max-h-[calc(100dvh-6.5rem)] flex-col">
        <div className="flex items-stretch border-b border-white/5">
          <div className="flex min-w-0 flex-1 text-xs font-medium">
            {workspaceMode === "lsp" ? (
              <>
                <button
                  type="button"
                  onClick={() => setTab("constraints")}
                  className={`flex-1 border-b-2 px-2 py-2.5 ${
                    tab === "constraints"
                      ? "border-cyan-400 text-cyan-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  Path Rules
                </button>
                <button
                  type="button"
                  onClick={() => setTab("lspDetails")}
                  className={`flex-1 border-b-2 px-2 py-2.5 ${
                    tab === "lspDetails"
                      ? "border-cyan-400 text-cyan-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  LSP Details
                </button>
              </>
            ) : (
              <div className="flex-1 px-2 py-2.5 text-slate-300">Failure Controls</div>
            )}
          </div>
          <button
            type="button"
            title="Collapse"
            onClick={() => setOpen(false)}
            className="shrink-0 px-2 text-slate-500 hover:bg-white/5 hover:text-slate-200"
          >
            <X size={16} className="m-1" />
          </button>
        </div>
        {workspaceMode === "traffic" ? (
          <TrafficPanel globalBusy={props.globalBusy} onGlobalLoading={props.onGlobalLoading} />
        ) : tab === "constraints" ? (
          <div className="floating-panel-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-sm text-slate-100">
            <div>
              <div className="mb-1 text-[10px] uppercase text-slate-500">Project</div>
              <div className="mb-1 flex flex-col gap-1.5">
                <input
                  id={props.fileInputId}
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  onChange={(e) => void onPickCsv(e)}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => document.getElementById(props.fileInputId)?.click()}
                    className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                  >
                    Import Data
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onSaveProject()}
                    className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                  >
                    Save project
                  </button>
                </div>
                <label>
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
                  <span className="block cursor-pointer rounded-lg border border-white/10 py-1.5 text-center text-xs text-slate-200 hover:bg-white/5">
                    Open project…
                  </span>
                </label>
              </div>
            </div>
            <label className="block text-xs">
              <span className="text-slate-400">LSP name (export label)</span>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-slate-100"
                value={lspName}
                onChange={(e) => setLspName(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-400">CLI Type</span>
              <select
                className="floating-native-select mt-1 w-full rounded-lg px-2 py-1.5 text-sm"
                value={nokiaCliStyle}
                onChange={(e) => setNokiaCliStyle(e.target.value as NokiaCliStyle)}
              >
                {nokiaOptions.map((o) => (
                  <option
                    key={o}
                    value={o}
                    className="bg-slate-900 text-slate-200"
                    style={{ backgroundColor: "rgb(15, 23, 42)", color: "rgb(241, 245, 249)" }}
                  >
                    {o === "md" ? "MD-CLI" : "Classic"}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>Required BW (Mbps)</span>
                <span className="text-slate-500">{requiredBw}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100000}
                step={100}
                value={requiredBw}
                onChange={(e) => setRequiredBw(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>Time (hour)</span>
                <span className="text-slate-500">{timeHour}</span>
              </div>
              <input
                type="range"
                min={0}
                max={23}
                step={1}
                value={timeHour}
                onChange={(e) => setTimeHour(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>Max Hops</span>
                <span className="text-slate-500">{maxHops}</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={Math.min(50, maxHops)}
                onChange={(e) => setMaxHops(Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-300">Enforce Role-Based Path Finding</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-cyan-500"
                checked={enforceRoles}
                onChange={(e) => setEnforceRoles(e.target.checked)}
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span>Backup Availability Trade-Off</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-cyan-500"
                  checked={backupTradeoffEnabled}
                  onChange={(e) => {
                    setBackupTradeoffEnabled(e.target.checked);
                    setTradeoffMode("percent");
                  }}
                />
              </label>
              {backupTradeoffEnabled ? (
                <div className="space-y-1.5">
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                    <span>Extra primary latency for backup search (% of best path)</span>
                    <span>{Math.min(100, tradeoffValue)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.min(100, tradeoffValue)}
                    onChange={(e) => {
                      setTradeoffMode("percent");
                      setTradeoffValue(Number(e.target.value));
                    }}
                    className="w-full accent-cyan-500"
                  />
                </div>
              ) : null}
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span>Exclude SRLG (backup diversity)</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-cyan-500"
                checked={enforceSrlgDiversity}
                onChange={(e) => setEnforceSrlgDiversity(e.target.checked)}
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-400">Flex-Algo Profile</span>
              <select
                className="floating-native-select mt-1 w-full rounded-lg px-2 py-1.5 text-sm"
                value={presetValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "igp") {
                    setFlexAlgoId(null);
                    return;
                  }
                  if (v === "custom") {
                    const first = Object.values(flexAlgos).sort((a, b) => a.id - b.id)[0];
                    if (first) {
                      setFlexAlgoId(first.id);
                    }
                    return;
                  }
                  setFlexAlgoId(Number(v));
                }}
              >
                {[
                  { v: "igp", t: "IGP (default)" },
                  { v: "128", t: "Low-Latency (128)" },
                  { v: "129", t: "High-Bandwidth (129)" },
                  { v: "130", t: "Diverse-Path (130)" },
                  { v: "custom", t: "Custom…" },
                ].map(({ v, t }) => (
                  <option
                    key={v}
                    value={v}
                    className="bg-slate-900 text-slate-200"
                    style={{ backgroundColor: "rgb(15, 23, 42)", color: "rgb(241, 245, 249)" }}
                  >
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {presetValue === "custom" && flexAlgoId != null && !PRESET_ALGO.has(flexAlgoId) ? (
              <label className="block text-xs">
                <span className="text-slate-400">Custom Flex-Algo ID</span>
                <select
                  className="floating-native-select mt-1 w-full rounded-lg px-2 py-1.5 text-sm"
                  value={String(flexAlgoId)}
                  onChange={(e) => setFlexAlgoId(Number(e.target.value))}
                >
                  {Object.values(flexAlgos)
                    .sort((a, b) => a.id - b.id)
                    .map((d) => (
                      <option
                        key={d.id}
                        value={d.id}
                        className="bg-slate-900 text-slate-200"
                        style={{ backgroundColor: "rgb(15, 23, 42)", color: "rgb(241, 245, 249)" }}
                      >
                        {d.name} ({d.id})
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <div className="flex gap-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  void resetDefaults();
                  toast("Defaults restored", { duration: 2000 });
                }}
                className="text-xs text-slate-500 transition hover:text-cyan-400"
              >
                Reset to defaults
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                clearFailures();
                setBaselinePrimary(null);
                setImpact(null);
              }}
              className="w-full rounded-lg border border-white/10 py-1.5 text-xs text-slate-300 hover:bg-white/5"
            >
              Reset failure simulation
            </button>
          </div>
        ) : (
          <div className="floating-panel-scroll min-h-0 flex-1 overflow-y-auto">
            {!lastCompute?.primary ? (
              <p className="px-3 pt-3 text-center text-xs text-slate-500">No LSP computed yet</p>
            ) : null}
            <LspDetailsTab
              busy={props.globalBusy}
              onGlobalLoading={props.onGlobalLoading}
              onLoadLsp={props.onLoadLspFromList}
            />
          </div>
        )}
      </div>
    </div>
  );
}
