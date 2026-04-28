import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useLspCompute } from "./hooks/useLspCompute";
import { GraphView, type GraphViewHandle } from "./components/GraphView";
import { useAppStore } from "./store/useAppStore";
import { loadLayoutPositions, saveLayoutPositions } from "./utils/layoutCache";
import { downloadJson, isProjectFileV1, readTextFile, topologyToProjectPayload, type ProjectFileV1 } from "./utils/projectFile";
import { fetchTopology, importTopology, openProjectTopology, errorDetail } from "./services/apiClient";
import type { TopologyPayload } from "./types";
import { TopBar } from "./components/TopBar";
import { FloatingPanel } from "./components/FloatingPanel";
import { MapToolbar } from "./components/MapToolbar";
import { HeatmapLegend } from "./components/HeatmapLegend";
import { ConfigOverlay, ConfigOverlayTrigger } from "./components/ConfigOverlay";
const FILE_INPUT_ID = "lsp-csv-file-input";

export default function App() {
  const [topology, setTopology] = useState<TopologyPayload | null>(null);
  const [topologyRevision, setTopologyRevision] = useState(0);
  const [dragHint, setDragHint] = useState(false);
  const [globalBusy, setGlobalBusy] = useState(false);
  const graphRef = useRef<GraphViewHandle | null>(null);

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
  const enforceRoles = useAppStore((s) => s.enforceRoles);
  const tradeoffMode = useAppStore((s) => s.tradeoffMode);
  const tradeoffValue = useAppStore((s) => s.tradeoffValue);
  const backupTradeoffEnabled = useAppStore((s) => s.backupTradeoffEnabled);
  const timeHour = useAppStore((s) => s.timeHour);
  const failedNeIds = useAppStore((s) => s.failedNeIds);
  const failedLinkKeys = useAppStore((s) => s.failedLinkKeys);
  const setLastImportSummary = useAppStore((s) => s.setLastImportSummary);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);
  const lspName = useAppStore((s) => s.lspName);
  const lsps = useAppStore((s) => s.lsps);
  const setReservations = useAppStore((s) => s.setReservations);
  const setMode = useAppStore((s) => s.setMode);
  const setRequiredBw = useAppStore((s) => s.setRequiredBw);
  const setMaxHops = useAppStore((s) => s.setMaxHops);
  const setNokiaCliStyle = useAppStore((s) => s.setNokiaCliStyle);
  const setLspName = useAppStore((s) => s.setLspName);
  const setNokiaRsvpLabelXForward = useAppStore((s) => s.setNokiaRsvpLabelXForward);
  const setNokiaRsvpLabelYForward = useAppStore((s) => s.setNokiaRsvpLabelYForward);
  const setNokiaRsvpLabelZForward = useAppStore((s) => s.setNokiaRsvpLabelZForward);
  const setNokiaRsvpLabelXReverse = useAppStore((s) => s.setNokiaRsvpLabelXReverse);
  const setNokiaRsvpLabelYReverse = useAppStore((s) => s.setNokiaRsvpLabelYReverse);
  const setNokiaRsvpLabelZReverse = useAppStore((s) => s.setNokiaRsvpLabelZReverse);
  const setNokiaRsvpLabelXForwardRevert = useAppStore((s) => s.setNokiaRsvpLabelXForwardRevert);
  const setNokiaRsvpLabelYForwardRevert = useAppStore((s) => s.setNokiaRsvpLabelYForwardRevert);
  const setNokiaRsvpLabelZForwardRevert = useAppStore((s) => s.setNokiaRsvpLabelZForwardRevert);
  const setNokiaRsvpLabelXReverseRevert = useAppStore((s) => s.setNokiaRsvpLabelXReverseRevert);
  const setNokiaRsvpLabelYReverseRevert = useAppStore((s) => s.setNokiaRsvpLabelYReverseRevert);
  const setNokiaRsvpLabelZReverseRevert = useAppStore((s) => s.setNokiaRsvpLabelZReverseRevert);
  const setSource = useAppStore((s) => s.setSource);
  const setDestination = useAppStore((s) => s.setDestination);
  const setFlexAlgoId = useAppStore((s) => s.setFlexAlgoId);
  const upsertFlexAlgo = useAppStore((s) => s.upsertFlexAlgo);
  const setEnforceSrlgDiversity = useAppStore((s) => s.setEnforceSrlgDiversity);
  const setEnforceRoles = useAppStore((s) => s.setEnforceRoles);
  const setTradeoffMode = useAppStore((s) => s.setTradeoffMode);
  const setTradeoffValue = useAppStore((s) => s.setTradeoffValue);
  const setBackupTradeoffEnabled = useAppStore((s) => s.setBackupTradeoffEnabled);
  const setFloatingPanelOpen = useAppStore((s) => s.setFloatingPanelOpen);
  const setActivePanelTab = useAppStore((s) => s.setActivePanelTab);
  const heatmapEnabled = useAppStore((s) => s.heatmapEnabled);
  const { runCompute } = useLspCompute({
    onGlobalLoading: setGlobalBusy,
  });
  useEffect(() => {
    document.title = "PRISM";
  }, []);

  const reloadTopology = useCallback(async () => {
    const t = await fetchTopology();
    setTopology(t);
    setTopologyRevision((r) => r + 1);
    const ids = t.nodes.map((n) => String(n.data.id)).sort();
    setNeIds(ids);
    const st = useAppStore.getState();
    st.clearFailures();
    const inGraph = new Set(ids);
    if (ids.length === 0) {
      st.setSource("");
      st.setDestination("");
      return;
    }
    let nextSource = inGraph.has(st.source) && st.source ? st.source : ids[0]!;
    let nextDest =
      inGraph.has(st.destination) && st.destination && st.destination !== nextSource
        ? st.destination
        : ids[ids.length - 1]!;
    if (nextDest === nextSource && ids.length > 1) {
      nextDest = ids[0] === nextSource ? ids[ids.length - 1]! : ids[0]!;
    }
    st.setSource(nextSource);
    st.setDestination(nextDest);
  }, [setNeIds]);

  const focusPaths = Boolean(lastCompute?.primary);

  useEffect(() => {
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
    const onCompute = () => {
      void runCompute();
    };
    window.addEventListener("lsp:compute", onCompute);
    return () => window.removeEventListener("lsp:compute", onCompute);
  }, [runCompute]);

  // Auto recompute: only when the backup availability *slider* value changes (not on source/dest or other settings).
  const prevTradeoff = useRef(tradeoffValue);
  const tradeoffSliderInit = useRef(true);
  useEffect(() => {
    if (tradeoffSliderInit.current) {
      tradeoffSliderInit.current = false;
      prevTradeoff.current = tradeoffValue;
      return;
    }
    if (prevTradeoff.current === tradeoffValue) {
      return;
    }
    prevTradeoff.current = tradeoffValue;
    const s = useAppStore.getState();
    if (!s.source || !s.destination) {
      return;
    }
    if (!s.backupTradeoffEnabled) {
      return;
    }
    const t = window.setTimeout(() => {
      void runCompute();
    }, 300);
    return () => {
      window.clearTimeout(t);
    };
  }, [tradeoffValue, runCompute]);

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
          toast(`${summary.invalid_rows.length} row(s) skipped — see LSP Details`, { duration: 6000 });
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

  const browseFiles = useCallback(() => {
    const el = document.getElementById(FILE_INPUT_ID) as HTMLInputElement | null;
    el?.click();
  }, []);

  const saveProject = useCallback(() => {
    if (!topology) {
      toast.error("No topology loaded");
      return;
    }
    const s = useAppStore.getState();
    const defaultName = (lspName || "project").trim();
    const picked = window.prompt("Save project as…", defaultName);
    if (picked === null) {
      return;
    }
    const name = picked.trim() || defaultName;
    const positions = loadLayoutPositions(topology);
    const file: ProjectFileV1 = {
      version: 1,
      exportedAt: new Date().toISOString(),
      topology,
      layoutPositions: positions,
      ui: {
        source: s.source,
        destination: s.destination,
        requiredBwMbps: s.requiredBwMbps,
        maxHops: s.maxHops,
        mode: s.mode,
        flexAlgoId: s.flexAlgoId,
        enforceSrlgDiversity: s.enforceSrlgDiversity,
        enforceRoles: s.enforceRoles,
        tradeoffMode: s.tradeoffMode,
        tradeoffValue: s.tradeoffValue,
        backupTradeoffEnabled: s.backupTradeoffEnabled,
        nokiaCliStyle: s.nokiaCliStyle,
        lspName: s.lspName,
        nokiaRsvpLabelXForward: s.nokiaRsvpLabelXForward,
        nokiaRsvpLabelYForward: s.nokiaRsvpLabelYForward,
        nokiaRsvpLabelZForward: s.nokiaRsvpLabelZForward,
        nokiaRsvpLabelXReverse: s.nokiaRsvpLabelXReverse,
        nokiaRsvpLabelYReverse: s.nokiaRsvpLabelYReverse,
        nokiaRsvpLabelZReverse: s.nokiaRsvpLabelZReverse,
        nokiaRsvpLabelXForwardRevert: s.nokiaRsvpLabelXForwardRevert,
        nokiaRsvpLabelYForwardRevert: s.nokiaRsvpLabelYForwardRevert,
        nokiaRsvpLabelZForwardRevert: s.nokiaRsvpLabelZForwardRevert,
        nokiaRsvpLabelXReverseRevert: s.nokiaRsvpLabelXReverseRevert,
        nokiaRsvpLabelYReverseRevert: s.nokiaRsvpLabelYReverseRevert,
        nokiaRsvpLabelZReverseRevert: s.nokiaRsvpLabelZReverseRevert,
        floatingPanelOpen: s.floatingPanelOpen,
        activePanelTab: s.activePanelTab,
      },
      lsps: Object.values(lsps),
      flex_algos: flexAlgos,
    };
    downloadJson(`${name}.lsp.json`, file);
    toast.success(`Project saved: ${name}.lsp.json`);
  }, [topology, lspName, lsps, flexAlgos]);

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
        await openProjectTopology(topologyToProjectPayload(project.topology));
        await reloadTopology();
        if (project.layoutPositions) {
          saveLayoutPositions(project.topology, project.layoutPositions);
        }
        const ui = project.ui;
        setMode(ui.mode);
        setRequiredBw(ui.requiredBwMbps);
        setMaxHops(Math.min(50, ui.maxHops));
        setNokiaCliStyle(ui.nokiaCliStyle);
        setLspName(ui.lspName);
        setSource(ui.source);
        setDestination(ui.destination);
        if (ui.tradeoffMode === "percent" || ui.tradeoffMode === "absolute") {
          setTradeoffMode(ui.tradeoffMode);
        }
        if (typeof ui.tradeoffValue === "number" && !Number.isNaN(ui.tradeoffValue)) {
          setTradeoffValue(ui.tradeoffValue);
        }
        if (typeof ui.backupTradeoffEnabled === "boolean") {
          setBackupTradeoffEnabled(ui.backupTradeoffEnabled);
        }
        if (project.flex_algos) {
          for (const def of Object.values(project.flex_algos)) {
            upsertFlexAlgo(def);
          }
        }
        if (typeof ui.enforceSrlgDiversity === "boolean") {
          setEnforceSrlgDiversity(ui.enforceSrlgDiversity);
        }
        if (typeof ui.enforceRoles === "boolean") {
          setEnforceRoles(ui.enforceRoles);
        }
        if (typeof ui.floatingPanelOpen === "boolean") {
          setFloatingPanelOpen(ui.floatingPanelOpen);
        }
        if (ui.activePanelTab === "constraints" || ui.activePanelTab === "lspDetails") {
          setActivePanelTab(ui.activePanelTab);
        }
        const legacyX = typeof ui.nokiaRsvpLabelX === "string" ? ui.nokiaRsvpLabelX : "";
        const legacyY = typeof ui.nokiaRsvpLabelY === "string" ? ui.nokiaRsvpLabelY : "";
        const legacyZ = typeof ui.nokiaRsvpLabelZ === "string" ? ui.nokiaRsvpLabelZ : "";
        setNokiaRsvpLabelXForward(typeof ui.nokiaRsvpLabelXForward === "string" ? ui.nokiaRsvpLabelXForward : legacyX);
        setNokiaRsvpLabelYForward(typeof ui.nokiaRsvpLabelYForward === "string" ? ui.nokiaRsvpLabelYForward : legacyY);
        setNokiaRsvpLabelZForward(typeof ui.nokiaRsvpLabelZForward === "string" ? ui.nokiaRsvpLabelZForward : legacyZ);
        setNokiaRsvpLabelXReverse(typeof ui.nokiaRsvpLabelXReverse === "string" ? ui.nokiaRsvpLabelXReverse : legacyX);
        setNokiaRsvpLabelYReverse(typeof ui.nokiaRsvpLabelYReverse === "string" ? ui.nokiaRsvpLabelYReverse : legacyY);
        setNokiaRsvpLabelZReverse(typeof ui.nokiaRsvpLabelZReverse === "string" ? ui.nokiaRsvpLabelZReverse : legacyZ);
        setNokiaRsvpLabelXForwardRevert(typeof ui.nokiaRsvpLabelXForwardRevert === "string" ? ui.nokiaRsvpLabelXForwardRevert : "");
        setNokiaRsvpLabelYForwardRevert(typeof ui.nokiaRsvpLabelYForwardRevert === "string" ? ui.nokiaRsvpLabelYForwardRevert : "");
        setNokiaRsvpLabelZForwardRevert(typeof ui.nokiaRsvpLabelZForwardRevert === "string" ? ui.nokiaRsvpLabelZForwardRevert : "");
        setNokiaRsvpLabelXReverseRevert(typeof ui.nokiaRsvpLabelXReverseRevert === "string" ? ui.nokiaRsvpLabelXReverseRevert : "");
        setNokiaRsvpLabelYReverseRevert(typeof ui.nokiaRsvpLabelYReverseRevert === "string" ? ui.nokiaRsvpLabelYReverseRevert : "");
        setNokiaRsvpLabelZReverseRevert(typeof ui.nokiaRsvpLabelZReverseRevert === "string" ? ui.nokiaRsvpLabelZReverseRevert : "");
        setFlexAlgoId(ui.flexAlgoId ?? null);
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
      setEnforceRoles,
      setEnforceSrlgDiversity,
      setFlexAlgoId,
      setLspName,
      setMaxHops,
      setMode,
      setNokiaCliStyle,
      setRequiredBw,
      setSource,
      upsertFlexAlgo,
      setBackupTradeoffEnabled,
      setTradeoffMode,
      setTradeoffValue,
      setActivePanelTab,
      setFloatingPanelOpen,
      setNokiaRsvpLabelXForward,
      setNokiaRsvpLabelYForward,
      setNokiaRsvpLabelZForward,
      setNokiaRsvpLabelXReverse,
      setNokiaRsvpLabelYReverse,
      setNokiaRsvpLabelZReverse,
      setNokiaRsvpLabelXForwardRevert,
      setNokiaRsvpLabelYForwardRevert,
      setNokiaRsvpLabelZForwardRevert,
      setNokiaRsvpLabelXReverseRevert,
      setNokiaRsvpLabelYReverseRevert,
      setNokiaRsvpLabelZReverseRevert,
    ],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveProject();
        } else if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          const el = document.getElementById("ne-search-source") as HTMLInputElement | null;
          el?.focus();
        } else if (e.key === "Enter") {
          e.preventDefault();
          window.dispatchEvent(new Event("lsp:compute"));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveProject]);

  const onLoadLspFromList = useCallback(() => {
    // Store + graph are updated in SavedLsps block
  }, []);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragHint(true);
      }}
      onDragLeave={() => setDragHint(false)}
      onDrop={(e) => void onDrop(e)}
    >
      <TopBar
        onCompute={() => {
          void runCompute();
        }}
        busy={globalBusy}
      />
      <div className="relative min-h-0 flex-1">
        {dragHint ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40 text-sm text-white">
            Drop nes.csv and links.csv
          </div>
        ) : null}
        <div className="flex h-full min-h-0 flex-1">
          <GraphView
            ref={graphRef}
            topology={topology}
            topologyRevision={topologyRevision}
            primary={lastCompute?.primary ?? null}
            backup={lastCompute?.backup ?? null}
            focusPaths={focusPaths}
            busy={globalBusy}
            onBrowseFiles={browseFiles}
          />
          {topology ? <MapToolbar graphRef={graphRef} /> : null}
          {heatmapEnabled ? <HeatmapLegend /> : null}
          <FloatingPanel
            fileInputId={FILE_INPUT_ID}
            globalBusy={globalBusy}
            onGlobalLoading={setGlobalBusy}
            onImported={reloadTopology}
            onLoadLspFromList={onLoadLspFromList}
            onSaveProject={saveProject}
            onOpenProject={(f) => void openProject(f)}
          />
        </div>
        <ConfigOverlay />
        <ConfigOverlayTrigger />
      </div>
    </div>
  );
}
