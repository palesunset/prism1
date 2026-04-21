import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ControlPanel } from "./components/ControlPanel";
import { GraphView } from "./components/GraphView";
import { JustificationPanel } from "./components/JustificationPanel";
import { LspSidebar } from "./components/LspSidebar";
import { computePaths, errorDetail, fetchTopology, importSampleTopology, importTopology, openProjectTopology } from "./services/apiClient";
import type { TopologyPayload } from "./types";
import { useAppStore } from "./store/useAppStore";
import { loadLayoutPositions, saveLayoutPositions } from "./utils/layoutCache";
import { downloadJson, isProjectFileV1, readTextFile, topologyToProjectPayload, type ProjectFileV1 } from "./utils/projectFile";

const FILE_INPUT_ID = "lsp-csv-file-input";

export default function App() {
  const [topology, setTopology] = useState<TopologyPayload | null>(null);
  const [topologyRevision, setTopologyRevision] = useState(0);
  const [dragHint, setDragHint] = useState(false);
  const [globalBusy, setGlobalBusy] = useState(false);

  const lastCompute = useAppStore((s) => s.lastCompute);
  const setNeIds = useAppStore((s) => s.setNeIds);
  const source = useAppStore((s) => s.source);
  const destination = useAppStore((s) => s.destination);
  const requiredBw = useAppStore((s) => s.requiredBwMbps);
  const maxHops = useAppStore((s) => s.maxHops);
  const mode = useAppStore((s) => s.mode);
  const flexAlgoId = useAppStore((s) => s.flexAlgoId);
  const flexAlgos = useAppStore((s) => s.flexAlgos);
  const enforceSrlgDiversity = useAppStore((s) => s.enforceSrlgDiversity);
  const timeHour = useAppStore((s) => s.timeHour);
  const failedNeIds = useAppStore((s) => s.failedNeIds);
  const failedLinkKeys = useAppStore((s) => s.failedLinkKeys);
  const setLastCompute = useAppStore((s) => s.setLastCompute);
  const setImpact = useAppStore((s) => s.setImpact);
  const setLastImportSummary = useAppStore((s) => s.setLastImportSummary);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);
  const lspName = useAppStore((s) => s.lspName);
  const lsps = useAppStore((s) => s.lsps);
  const setMode = useAppStore((s) => s.setMode);
  const setRequiredBw = useAppStore((s) => s.setRequiredBw);
  const setMaxHops = useAppStore((s) => s.setMaxHops);
  const setNokiaCliStyle = useAppStore((s) => s.setNokiaCliStyle);
  const setLspName = useAppStore((s) => s.setLspName);
  const setSource = useAppStore((s) => s.setSource);
  const setDestination = useAppStore((s) => s.setDestination);
  const setReservations = useAppStore((s) => s.setReservations);
  const setFlexAlgoId = useAppStore((s) => s.setFlexAlgoId);
  const upsertFlexAlgo = useAppStore((s) => s.upsertFlexAlgo);
  const setEnforceSrlgDiversity = useAppStore((s) => s.setEnforceSrlgDiversity);

  const reloadTopology = useCallback(async () => {
    const t = await fetchTopology();
    setTopology(t);
    setTopologyRevision((r) => r + 1);
    const ids = t.nodes.map((n) => String(n.data.id)).sort();
    setNeIds(ids);
    const st = useAppStore.getState();
    if (!st.source && ids[0]) {
      st.setSource(ids[0]);
    }
    if (!st.destination && ids.length > 1) {
      st.setDestination(ids[ids.length - 1]);
    }
  }, [setNeIds]);

  const focusPaths = Boolean(lastCompute?.primary);

  useEffect(() => {
    // Keep heatmap reservations aligned to all saved LSPs
    const all = Object.values(lsps)
      .filter((l) => l.primary)
      .map((l) => ({
        name: l.name,
        primary_edges: l.primary!.edges,
        required_bw_mbps: l.requiredBwMbps > 0 ? l.requiredBwMbps : 100,
      }));
    setReservations(all);
  }, [lsps, setReservations]);

  useEffect(() => {
    if (!topology || !source || !destination) {
      return;
    }
    if (failedNeIds.length === 0 && failedLinkKeys.length === 0) {
      return;
    }

    const handle = window.setTimeout(() => {
      setGlobalBusy(true);
      void (async () => {
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
          const baseline = useAppStore.getState().baselinePrimary;
          if (baseline && res.primary) {
            setImpact({
              primaryLatencyDeltaMs: res.primary.total_latency_ms - baseline.total_latency_ms,
              primaryHopDelta: res.primary.hop_count - baseline.hop_count,
            });
          } else {
            setImpact(null);
          }
        } catch (err) {
          toast.error(errorDetail(err));
        } finally {
          setGlobalBusy(false);
        }
      })();
    }, 200);

    return () => {
      window.clearTimeout(handle);
    };
  }, [
    topology,
    source,
    destination,
    requiredBw,
    maxHops,
    mode,
    timeHour,
    failedNeIds,
    failedLinkKeys,
    setLastCompute,
    setImpact,
  ]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragHint(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith(".csv"));
      if (files.length < 2) {
        toast.error("Please drop both nes.csv and links.csv");
        return;
      }
      const nes = files.find((f) => f.name.toLowerCase().includes("nes")) ?? files[0];
      const links = files.find((f) => f.name.toLowerCase().includes("link")) ?? files[1];
      setGlobalBusy(true);
      try {
        const summary = await importTopology({ nes, links });
        setLastImportSummary(summary);
        toast.success(`Imported ${summary.ne_count} NEs, ${summary.link_count} links`);
        if (summary.invalid_rows?.length) {
          toast(`${summary.invalid_rows.length} row(s) skipped — see Justification panel`, { duration: 6000 });
        }
        await reloadTopology();
      } catch (err) {
        toast.error(errorDetail(err));
      } finally {
        setGlobalBusy(false);
      }
    },
    [reloadTopology, setLastImportSummary],
  );

  const header = useMemo(
    () => (
      <div className="border-b border-slate-800 bg-[#0A0F1C] px-4 py-3">
        <div className="text-lg font-semibold text-slate-100">LSP Simulator</div>
        <div className="text-xs text-slate-400">
          Offline topology import, CSPF, failure simulation, and multi-vendor config snippets.
        </div>
      </div>
    ),
    [],
  );

  const browseFiles = useCallback(() => {
    const el = document.getElementById(FILE_INPUT_ID) as HTMLInputElement | null;
    el?.click();
  }, []);

  const saveProject = useCallback(() => {
    if (!topology) {
      toast.error("No topology loaded");
      return;
    }
    const positions = loadLayoutPositions(topology);
    const file: ProjectFileV1 = {
      version: 1,
      exportedAt: new Date().toISOString(),
      topology,
      layoutPositions: positions,
      ui: {
        source,
        destination,
        requiredBwMbps: requiredBw,
        maxHops,
        mode,
        flexAlgoId,
        enforceSrlgDiversity,
        nokiaCliStyle,
        lspName,
      },
      lsps: Object.values(lsps),
      flex_algos: flexAlgos,
    };
    downloadJson(`${lspName || "project"}.lsp.json`, file);
    toast.success("Project saved");
  }, [topology, source, destination, requiredBw, maxHops, mode, nokiaCliStyle, lspName, lsps]);

  const openProject = useCallback(
    async (file: File) => {
      setGlobalBusy(true);
      try {
        const text = await readTextFile(file);
        const parsed = JSON.parse(text) as unknown;
        if (!isProjectFileV1(parsed)) {
          toast.error("Not a valid .lsp.json project file");
          return;
        }
        const project = parsed as ProjectFileV1;
        // Restore backend topology for compute/export APIs
        await openProjectTopology(topologyToProjectPayload(project.topology));
        await reloadTopology();
        // Restore cached layout positions locally
        if (project.layoutPositions) {
          saveLayoutPositions(project.topology, project.layoutPositions);
        }
        // Restore UI state
        setMode(project.ui.mode);
        setRequiredBw(project.ui.requiredBwMbps);
        setMaxHops(project.ui.maxHops);
        setNokiaCliStyle(project.ui.nokiaCliStyle);
        setLspName(project.ui.lspName);
        setSource(project.ui.source);
        setDestination(project.ui.destination);
        if (project.flex_algos) {
          for (const def of Object.values(project.flex_algos)) {
            upsertFlexAlgo(def);
          }
        }
        if (typeof project.ui.enforceSrlgDiversity === "boolean") {
          setEnforceSrlgDiversity(project.ui.enforceSrlgDiversity);
        }
        setFlexAlgoId(project.ui.flexAlgoId ?? null);
        toast.success("Project opened");
      } catch (err) {
        toast.error(errorDetail(err));
      } finally {
        setGlobalBusy(false);
      }
    },
    [
      reloadTopology,
      setDestination,
      setLspName,
      setMaxHops,
      setMode,
      setNokiaCliStyle,
      setRequiredBw,
      setSource,
    ],
  );

  const loadSample = useCallback(async () => {
    setGlobalBusy(true);
    try {
      const summary = await importSampleTopology();
      setLastImportSummary(summary);
      toast.success(`Imported sample: ${summary.ne_count} NEs, ${summary.link_count} links`);
      await reloadTopology();
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      setGlobalBusy(false);
    }
  }, [reloadTopology, setLastImportSummary]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById("ne-search") as HTMLInputElement | null;
        el?.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        window.dispatchEvent(new Event("lsp:compute"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveProject]);

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragHint(true);
      }}
      onDragLeave={() => setDragHint(false)}
      onDrop={(e) => void onDrop(e)}
    >
      {header}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {dragHint ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/40 text-sm text-white">
            Drop nes.csv and links.csv
          </div>
        ) : null}
        <GraphView
          topology={topology}
          topologyRevision={topologyRevision}
          primary={lastCompute?.primary ?? null}
          backup={lastCompute?.backup ?? null}
          focusPaths={focusPaths}
          busy={globalBusy}
          onBrowseFiles={browseFiles}
          onLoadSample={loadSample}
        />
        <ControlPanel
          fileInputId={FILE_INPUT_ID}
          onGlobalLoading={setGlobalBusy}
          onImported={reloadTopology}
          onComputed={async () => {
            /* graph updates from store */
          }}
          onSaveProject={saveProject}
          onOpenProject={(f) => void openProject(f)}
          onLoadSample={() => void loadSample()}
        />
        <LspSidebar />
        <JustificationPanel />
      </div>
    </div>
  );
}
