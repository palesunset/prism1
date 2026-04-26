import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { trafficPaths, trafficRelief, trafficSimulate, errorDetail } from "../services/apiClient";
import { useAppStore } from "../store/useAppStore";
import type { InjectedFlow, ManualRedistribution, ReliefRecommendation, ReliefSuggestion } from "../types";

function Chip(props: { label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
      <span className="max-w-[180px] truncate">{props.label}</span>
      <button type="button" onClick={props.onRemove} className="text-slate-400 hover:text-white">
        ×
      </button>
    </div>
  );
}

function fmtMbps(mbps: number): string {
  if (!Number.isFinite(mbps)) return "-";
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(0)} Mbps`;
}

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "-";
  return `${p.toFixed(1)}%`;
}

export function TrafficPanel(props: { globalBusy: boolean; onGlobalLoading: (v: boolean) => void }) {
  const neIds = useAppStore((s) => s.neIds);
  const setActiveTab = useAppStore((s) => s.setTrafficActiveTab);

  // Failure Simulation state
  const failed = useAppStore((s) => s.trafficFailedElements);
  const selectionMode = useAppStore((s) => s.trafficSelectionMode);
  const setSelectionMode = useAppStore((s) => s.setTrafficSelectionMode);
  const removeFailure = useAppStore((s) => s.removeTrafficFailure);
  const clearFailures = useAppStore((s) => s.clearTrafficFailures);
  const failureResult = useAppStore((s) => s.trafficFailureResult);
  const setFailureResult = useAppStore((s) => s.setTrafficFailureResult);

  // Scenario Builder state
  const scenarioFailed = useAppStore((s) => s.scenarioFailedElements);
  const scenarioSelectionMode = useAppStore((s) => s.scenarioSelectionMode);
  const setScenarioSelectionMode = useAppStore((s) => s.setScenarioSelectionMode);
  const removeScenarioFailure = useAppStore((s) => s.removeScenarioFailure);
  const clearScenarioFailures = useAppStore((s) => s.clearScenarioFailures);
  const scenarioResult = useAppStore((s) => s.scenarioResult);
  const setScenarioResult = useAppStore((s) => s.setScenarioResult);
  const manualRedistributions = useAppStore((s) => s.manualRedistributions);
  const setManualRedistributions = useAppStore((s) => s.setManualRedistributions);
  const reliefSuggestions = useAppStore((s) => s.reliefSuggestions);
  const setReliefSuggestions = useAppStore((s) => s.setReliefSuggestions);
  const injectedFlows = useAppStore((s) => s.injectedFlows);
  const setInjectedFlows = useAppStore((s) => s.setInjectedFlows);
  const scenarioPathOptions = useAppStore((s) => s.scenarioPathOptions);
  const setScenarioPathOptions = useAppStore((s) => s.setScenarioPathOptions);
  const scenarioPathPreview = useAppStore((s) => s.scenarioPathPreview);
  const setScenarioPathPreview = useAppStore((s) => s.setScenarioPathPreview);

  const [tab, setTab] = useState<"failures" | "scenario" | "advisor">("failures");
  // Keep GraphView in sync with panel tab.
  useEffect(() => {
    setActiveTab(tab);
  }, [tab, setActiveTab]);
  const [threshold, setThreshold] = useState(80);
  const [maxExtraLatency, setMaxExtraLatency] = useState(10);
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [flowSrc, setFlowSrc] = useState("");
  const [flowDst, setFlowDst] = useState("");
  const [flowVol, setFlowVol] = useState(1000);
  const [activeScenarioFlowId, setActiveScenarioFlowId] = useState<string | null>(null);
  const [showScenarioPaths, setShowScenarioPaths] = useState(false);

  const failureSummary = useMemo(() => {
    const flows = failureResult?.flows ?? [];
    const disconnected = failureResult?.disconnected_flows ?? [];
    const diverted = flows.reduce((a, f) => a + (Number(f.volume_mbps) || 0), 0);
    const congested = failureResult?.congested_links?.length ?? 0;
    return { diverted, flowCount: flows.length, disconnected: disconnected.length, congested };
  }, [failureResult]);

  const scenarioSummary = useMemo(() => {
    const flows = scenarioResult?.flows ?? [];
    const disconnected = scenarioResult?.disconnected_flows ?? [];
    const diverted = flows.reduce((a, f) => a + (Number(f.volume_mbps) || 0), 0);
    const congested = scenarioResult?.congested_links?.length ?? 0;
    return { diverted, flowCount: flows.length, disconnected: disconnected.length, congested };
  }, [scenarioResult]);

  async function runFailure(nextManual?: ManualRedistribution[]) {
    props.onGlobalLoading(true);
    try {
      const manual = (nextManual ?? manualRedistributions).map((m) => ({
        flow_id: m.flowId,
        new_path: m.newPath,
        volume_mbps: m.volumeMbps,
      }));
      const res = await trafficSimulate({
        failed_elements: failed,
        congestion_threshold_pct: threshold,
        enforce_roles: false,
        manual_redistributions: manual,
      });
      setFailureResult(res);
      toast.success("Failure simulation completed");
      setTab("advisor");
      setActiveTab("advisor");
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      props.onGlobalLoading(false);
      setSelectionMode("none");
    }
  }

  async function runScenario(nextManual?: ManualRedistribution[]) {
    props.onGlobalLoading(true);
    // Running the scenario is about utilization/congestion impact; keep path exploration separate.
    setShowScenarioPaths(false);
    try {
      const manual = (nextManual ?? manualRedistributions).map((m) => ({
        flow_id: m.flowId,
        new_path: m.newPath,
        volume_mbps: m.volumeMbps,
      }));
      const res = await trafficSimulate({
        failed_elements: scenarioFailed,
        injected_flows: injectedFlows,
        congestion_threshold_pct: threshold,
        manual_redistributions: manual,
      });
      setScenarioResult(res);
      toast.success("Scenario simulation completed");
      const inj = res.injected_flows ?? [];
      const disc = inj.filter((f) => f.disconnected).length;
      if (disc) {
        toast(`${disc} injected flow(s) disconnected — see Scenario Results`, { duration: 5000 });
      }
      setTab("scenario");
      setActiveTab("scenario");
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      props.onGlobalLoading(false);
      setSelectionMode("none");
    }
  }

  async function runScenarioAndShowPaths() {
    // If user didn't explicitly select a flow, auto-select the only one.
    if (!activeScenarioFlowId && injectedFlows.length === 1) {
      setActiveScenarioFlowId(injectedFlows[0]!.id);
    }
    await runScenario();
    const flow =
      injectedFlows.find((f) => f.id === (activeScenarioFlowId ?? (injectedFlows.length === 1 ? injectedFlows[0]!.id : ""))) ??
      null;
    if (!flow) {
      return;
    }
    // If paths already cached, just show them; else fetch them.
    if ((scenarioPathOptions[flow.id] ?? []).length) {
      setShowScenarioPaths(true);
      return;
    }
    await loadPathsFor(flow);
  }

  async function runFailureSimulation() {
    await runFailure();
  }

  function addInjectedFlow() {
    const src = flowSrc.trim();
    const dst = flowDst.trim();
    const vol = Number(flowVol);
    if (!src || !dst || src === dst) {
      toast.error("Pick a valid source and destination");
      return;
    }
    if (!Number.isFinite(vol) || vol <= 0) {
      toast.error("Volume must be > 0");
      return;
    }
    if (injectedFlows.length >= 10) {
      toast.error("Max 10 injected flows");
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const next: InjectedFlow[] = [...injectedFlows, { id, source_ne_id: src, dest_ne_id: dst, volume_mbps: vol }];
    setInjectedFlows(next);
    setShowAddFlow(false);
    setFlowSrc("");
    setFlowDst("");
    setFlowVol(1000);
  }

  function removeInjectedFlow(id: string) {
    setInjectedFlows(injectedFlows.filter((f) => f.id !== id));
  }

  async function loadPathsFor(flow: InjectedFlow) {
    props.onGlobalLoading(true);
    try {
      const res = await trafficPaths({
        source_ne_id: flow.source_ne_id,
        dest_ne_id: flow.dest_ne_id,
        // Scenario Builder: path exploration must respect Scenario failures
        failed_elements: scenarioFailed,
        k: 5,
      });
      setScenarioPathOptions(flow.id, res.paths ?? []);
      if (res.paths?.length) {
        setScenarioPathPreview({ flowId: flow.id, idx: 0 });
      }
      setShowScenarioPaths(true);
      toast.success(`Found ${res.paths?.length ?? 0} path(s)`);
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      props.onGlobalLoading(false);
    }
  }

  const activeScenarioFlow = useMemo(
    () => injectedFlows.find((f) => f.id === activeScenarioFlowId) ?? null,
    [injectedFlows, activeScenarioFlowId],
  );

  async function findRelief() {
    if (!failureResult?.congested_links?.length) {
      toast("No congested links to relieve", { duration: 2500 });
      return;
    }
    props.onGlobalLoading(true);
    try {
      const res = await trafficRelief({
        failed_elements: failed,
        congestion_threshold_pct: threshold,
        max_extra_latency_ms: maxExtraLatency,
        max_suggestions_per_link: 3,
      });
      setReliefSuggestions(res.suggestions ?? []);
      toast.success("Relief paths computed");
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      props.onGlobalLoading(false);
    }
  }

  function applyRecommendation(_cong: ReliefSuggestion, rec: ReliefRecommendation) {
    const next: ManualRedistribution[] = [
      ...manualRedistributions,
      {
        flowId: rec.flow_id,
        originalPath: rec.current_path,
        newPath: rec.new_path,
        volumeMbps: rec.volume_mbps,
      },
    ];
    setManualRedistributions(next);
    void runFailure(next);
  }

  function undo(idx: number) {
    const next = manualRedistributions.filter((_, i) => i !== idx);
    setManualRedistributions(next);
    void runFailure(next);
  }

  return (
    <div className="floating-panel-scroll min-h-0 flex-1 overflow-y-auto p-3 text-sm text-slate-100">
      <div className="mb-3 flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => {
            setTab("failures");
            setActiveTab("failures");
          }}
          className={`flex-1 rounded-md px-2 py-1.5 ${tab === "failures" ? "bg-cyan-600 text-white" : "text-slate-300"}`}
        >
          Failure Controls
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("advisor");
            setActiveTab("advisor");
          }}
          className={`flex-1 rounded-md px-2 py-1.5 ${tab === "advisor" ? "bg-cyan-600 text-white" : "text-slate-300"}`}
        >
          Design Advisor
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("scenario");
            setActiveTab("scenario");
          }}
          className={`flex-1 rounded-md px-2 py-1.5 ${tab === "scenario" ? "bg-cyan-600 text-white" : "text-slate-300"}`}
        >
          Scenario Builder
        </button>
      </div>

      {tab === "failures" ? (
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-[10px] uppercase text-slate-500">Currently Failed Elements</div>
            <div className="flex flex-wrap gap-2">
              {failed.length ? (
                failed.map((f) => (
                  <Chip
                    key={`${f.type}:${f.id}`}
                    label={f.type === "link" ? `Link ${f.id}` : `Node ${f.id}`}
                    onRemove={() => removeFailure(f)}
                  />
                ))
              ) : (
                <div className="text-xs text-slate-500">None</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectionMode(selectionMode === "addFailure" ? "none" : "addFailure")}
              className={`rounded-lg border border-white/10 py-2 text-xs ${
                selectionMode === "addFailure" ? "bg-cyan-600 text-white" : "bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {selectionMode === "addFailure" ? "Click on map…" : "Add Failure"}
            </button>
            <button
              type="button"
              onClick={() => clearFailures()}
              className="rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10"
            >
              Reset Simulation
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-300">Congestion threshold</div>
              <div className="text-xs text-slate-500">{threshold}%</div>
            </div>
            <input
              type="range"
              min={50}
              max={95}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>

          <button
            type="button"
            disabled={props.globalBusy || failed.length === 0}
            onClick={() => void runFailureSimulation()}
            className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:shadow-cyan-500/25 disabled:opacity-50"
          >
            {props.globalBusy ? "Running…" : "Run Failure Simulation"}
          </button>

          {failureResult ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-[10px] uppercase text-slate-500">Simulation Summary</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-200">
                <div>
                  <div className="text-slate-500">Affected flows</div>
                  <div className="font-semibold">{failureSummary.flowCount}</div>
                </div>
                <div>
                  <div className="text-slate-500">Diverted traffic</div>
                  <div className="font-semibold">{fmtMbps(failureSummary.diverted)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Disconnected</div>
                  <div className="font-semibold">{failureSummary.disconnected}</div>
                </div>
                <div>
                  <div className="text-slate-500">Congested links</div>
                  <div className="font-semibold">{failureSummary.congested}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : tab === "scenario" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-[10px] uppercase text-slate-500">Active Failures</div>
            <div className="flex flex-wrap gap-2">
              {scenarioFailed.length ? (
                scenarioFailed.map((f) => (
                  <Chip
                    key={`scenario:${f.type}:${f.id}`}
                    label={f.type === "link" ? `Link ${f.id}` : `Node ${f.id}`}
                    onRemove={() => removeScenarioFailure(f)}
                  />
                ))
              ) : (
                <div className="text-xs text-slate-500">None</div>
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setScenarioSelectionMode(scenarioSelectionMode === "addFailure" ? "none" : "addFailure")
                }
                className={`rounded-lg border border-white/10 py-2 text-xs ${
                  scenarioSelectionMode === "addFailure"
                    ? "bg-cyan-600 text-white"
                    : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {scenarioSelectionMode === "addFailure" ? "Click on map…" : "Add Failure"}
              </button>
              <button
                type="button"
                onClick={() => clearScenarioFailures()}
                className="rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10"
              >
                Clear Failures
              </button>
            </div>

            <div className="my-3 border-t border-white/10" />

            <div className="mb-2 text-[10px] uppercase text-slate-500">Injected Traffic Flows</div>
            <div className="space-y-2">
              {injectedFlows.length ? (
                injectedFlows.map((f) => (
                  <div key={f.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveScenarioFlowId(f.id);
                          setShowScenarioPaths(false);
                        }}
                        className={`min-w-0 flex-1 truncate text-left ${
                          activeScenarioFlowId === f.id ? "text-cyan-200" : "text-slate-200"
                        }`}
                        title="Select this flow for path preview"
                      >
                        {f.source_ne_id} → {f.dest_ne_id} : {fmtMbps(f.volume_mbps)}
                      </button>
                      <button type="button" onClick={() => removeInjectedFlow(f.id)} className="text-slate-400 hover:text-white">
                        ×
                      </button>
                    </div>

                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">None</div>
              )}
            </div>

            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowAddFlow(!showAddFlow)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10"
              >
                {showAddFlow ? "Cancel" : "Add Traffic Flow"}
              </button>
            </div>

            {showAddFlow ? (
              <div className="mt-2 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-slate-400">Source</div>
                    <input
                      list="scenario-src-list"
                      value={flowSrc}
                      onChange={(e) => setFlowSrc(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-slate-100"
                      placeholder="Source NE"
                    />
                    <datalist id="scenario-src-list">
                      {neIds.map((id) => (
                        <option key={id} value={id} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <div className="text-slate-400">Destination</div>
                    <input
                      list="scenario-dst-list"
                      value={flowDst}
                      onChange={(e) => setFlowDst(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-slate-100"
                      placeholder="Dest NE"
                    />
                    <datalist id="scenario-dst-list">
                      {neIds.map((id) => (
                        <option key={id} value={id} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Volume (Mbps)</div>
                  <input
                    type="number"
                    min={1}
                    value={flowVol}
                    onChange={(e) => setFlowVol(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addInjectedFlow()}
                  className="w-full rounded-lg bg-cyan-600 py-2 text-xs text-white hover:bg-cyan-500"
                >
                  Add Flow
                </button>
              </div>
            ) : null}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={props.globalBusy || !activeScenarioFlow}
                onClick={() => {
                  if (!activeScenarioFlow) return;
                  if (showScenarioPaths) {
                    setShowScenarioPaths(false);
                    return;
                  }
                  // If we already have cached paths, just show them.
                  if ((scenarioPathOptions[activeScenarioFlow.id] ?? []).length) {
                    setShowScenarioPaths(true);
                    return;
                  }
                  void loadPathsFor(activeScenarioFlow);
                }}
                className="rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                title={activeScenarioFlow ? "Fetch k-shortest paths for selected flow" : "Select an injected flow above first"}
              >
                {showScenarioPaths ? "Hide possible paths" : "Show possible paths"}
              </button>
              <button
                type="button"
                disabled={props.globalBusy}
                onClick={() => {
                  setScenarioPathPreview(null);
                  setShowScenarioPaths(false);
                }}
                className="rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                Clear preview
              </button>
            </div>
            {activeScenarioFlow ? (
              <div className="mt-1 text-[11px] text-slate-500">
                Selected: {activeScenarioFlow.source_ne_id} → {activeScenarioFlow.dest_ne_id}
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-slate-500">Tip: click an injected flow above to select it for preview.</div>
            )}

            {activeScenarioFlow && showScenarioPaths ? (
              (scenarioPathOptions[activeScenarioFlow.id] ?? []).length ? (
                <div className="mt-2 space-y-1">
                  {(scenarioPathOptions[activeScenarioFlow.id] ?? []).map((p, idx) => {
                    const active =
                      scenarioPathPreview?.flowId === activeScenarioFlow.id && scenarioPathPreview?.idx === idx;
                    return (
                      <button
                        key={`${activeScenarioFlow.id}:${idx}`}
                        type="button"
                        onClick={() => setScenarioPathPreview({ flowId: activeScenarioFlow.id, idx })}
                        className={`block w-full rounded-md border border-white/10 px-2 py-1 text-left text-[11px] ${
                          active ? "bg-cyan-600/30 text-white" : "bg-black/10 text-slate-200 hover:bg-white/5"
                        }`}
                      >
                        Path {idx + 1}: {p.path_nodes.join(" → ")}{" "}
                        <span className="text-slate-500">({p.total_latency_ms.toFixed(1)} ms)</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-slate-500">No paths loaded yet. Click “Show possible paths”.</div>
              )
            ) : null}

            {(scenarioResult?.injected_flows ?? []).length ? (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-2">
                <div className="mb-2 text-[10px] uppercase text-slate-500">Scenario Results</div>
                <div className="space-y-2">
                  {(scenarioResult?.injected_flows ?? []).map((inj) => {
                    const edges = inj.path_edges ?? [];
                    const congestedEdges = (scenarioResult?.congested_links ?? []).filter((c) => edges.includes(c.edge_id));
                    return (
                      <div key={inj.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="text-slate-200">
                            {inj.source_ne_id} → {inj.dest_ne_id}
                          </div>
                          <div className="text-slate-200">{fmtMbps(inj.volume_mbps)}</div>
                        </div>
                        {inj.disconnected ? (
                          <div className="mt-1 text-red-300">Disconnected • {inj.reason ?? "no_path"}</div>
                        ) : (
                          <>
                            <div className="mt-1 text-slate-500">{(inj.path_nodes ?? []).join(" → ")}</div>
                            {congestedEdges.length ? (
                              <div className="mt-1 text-red-300">
                                Congestion on path:{" "}
                                {congestedEdges
                                  .slice(0, 2)
                                  .map((c) => `${c.edge_id} ${fmtPct(c.before_util_pct)}→${fmtPct(c.after_util_pct)}`)
                                  .join(", ")}
                                {congestedEdges.length > 2 ? "…" : ""}
                              </div>
                            ) : (
                              <div className="mt-1 text-emerald-300">No congestion on injected path</div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={props.globalBusy || (failed.length === 0 && injectedFlows.length === 0)}
                onClick={() => void runScenarioAndShowPaths()}
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Run Scenario
              </button>
              <button
                type="button"
                onClick={() => {
                  // Reset Scenario Builder only: keep failures, clear injected traffic + relief/applied changes.
                  setInjectedFlows([]);
                  setManualRedistributions([]);
                  setReliefSuggestions([]);
                  setScenarioPathPreview(null);
                  void runScenario([]);
                }}
                className="rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10"
              >
                Reset Injected Flows
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!failureResult ? <div className="text-xs text-slate-500">Run a simulation to see the report.</div> : null}

          {failureResult ? (
            <>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-[10px] uppercase text-slate-500">Summary</div>
                <div className="text-xs text-slate-200">
                  <div>
                    <span className="text-slate-500">Failed:</span>{" "}
                    {failed.map((f) => (f.type === "link" ? `Link ${f.id}` : `Node ${f.id}`)).join(", ") || "None"}
                  </div>
                  <div>
                    <span className="text-slate-500">Diverted:</span> {fmtMbps(failureSummary.diverted)}
                  </div>
                  <div>
                    <span className="text-slate-500">Disconnected:</span> {failureSummary.disconnected}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase text-slate-500">Flow Redistribution</div>
                <div className="space-y-2">
                  {failureResult.flows.map((f) => {
                    const congested = failureResult.congested_links.some((c) => f.path_edges.includes(c.edge_id));
                    return (
                      <div key={f.failed_link_id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="text-slate-200">{f.failed_link_id}</div>
                          <div className="text-slate-200">{fmtMbps(f.volume_mbps)}</div>
                        </div>
                        <div className="mt-1 text-slate-500">
                          {f.path_nodes.join(" → ")} {congested ? <span className="text-red-400">• congestion</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase text-slate-500">Congested Links</div>
                {failureResult.congested_links.length ? (
                  <div className="space-y-2">
                    {failureResult.congested_links.map((c) => (
                      <div key={c.edge_id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="text-slate-200">{c.edge_id}</div>
                          <div className="text-red-300 font-semibold">{fmtPct(c.after_util_pct)}</div>
                        </div>
                        <div className="mt-1 text-slate-500">
                          Before {fmtPct(c.before_util_pct)} → After {fmtPct(c.after_util_pct)} • +{fmtMbps(c.delta_mbps)} • Add{" "}
                          {fmtMbps(c.extra_bandwidth_mbps)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">None</div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-[10px] uppercase text-slate-500">Congestion Relief</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-300">Max extra latency</div>
                    <div className="text-xs text-slate-500">{maxExtraLatency} ms</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={maxExtraLatency}
                    onChange={(e) => setMaxExtraLatency(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <button
                    type="button"
                    disabled={props.globalBusy}
                    onClick={() => void findRelief()}
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    {props.globalBusy ? "Working…" : "Find Relief Paths"}
                  </button>
                </div>

                {reliefSuggestions.length ? (
                  <div className="mt-3 space-y-3">
                    {reliefSuggestions.map((s) => (
                      <div key={s.congested_link_id} className="rounded-lg border border-white/10 bg-black/10 p-2">
                        <div className="mb-2 text-xs text-slate-200">
                          <span className="text-slate-500">Congested:</span> {s.congested_link_id}{" "}
                          <span className="text-slate-500">({fmtPct(s.original_utilization_pct)})</span>
                        </div>
                        <div className="space-y-2">
                          {(s.recommendations ?? []).map((r, i) => (
                            <div key={`${s.congested_link_id}:${r.flow_id}:${i}`} className="rounded-lg border border-white/10 bg-white/5 p-2">
                              <div className="text-xs text-slate-200">
                                Move {fmtMbps(r.volume_mbps)} for <span className="font-semibold">{r.flow_id}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                New path: {r.new_path.join(" → ")} • Extra latency: +{r.extra_latency_ms.toFixed(1)} ms
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">Why: {r.reason}</div>
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => applyRecommendation(s, r)}
                                  className="flex-1 rounded-lg bg-cyan-600 py-1.5 text-xs text-white hover:bg-cyan-500"
                                >
                                  Apply
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // For now, "Ignore" just removes the suggestion card client-side.
                                    setReliefSuggestions(reliefSuggestions.filter((x) => x !== s));
                                  }}
                                  className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                                >
                                  Ignore
                                </button>
                              </div>
                            </div>
                          ))}
                          {!s.recommendations?.length ? (
                            <div className="text-xs text-slate-500">No valid relief paths found for this congestion.</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">No suggestions yet.</div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-[10px] uppercase text-slate-500">Applied Changes</div>
                {manualRedistributions.length ? (
                  <div className="space-y-2">
                    {manualRedistributions.map((m, idx) => (
                      <div key={`${m.flowId}:${idx}`} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="text-slate-200">{m.flowId}</div>
                          <button
                            type="button"
                            onClick={() => undo(idx)}
                            className="rounded bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                          >
                            Undo
                          </button>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {fmtMbps(m.volumeMbps)} • {m.originalPath.join(" → ")} → {m.newPath.join(" → ")}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setManualRedistributions([]);
                        void runFailure([]);
                      }}
                      className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10"
                    >
                      Reset All
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">None</div>
                )}
              </div>

              {failureResult.disconnected_flows.length ? (
                <div>
                  <div className="mb-2 text-[10px] uppercase text-slate-500">Disconnected Flows</div>
                  <div className="space-y-2">
                    {failureResult.disconnected_flows.map((d) => (
                      <div key={d.failed_link_id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-200">
                        {d.failed_link_id} ({d.source} → {d.target}){" "}
                        <span className="text-slate-500">• {d.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

