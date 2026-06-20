import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ComputeResponse,
  FailedTrafficElement,
  InjectedFlow,
  ImportSummary,
  ManualRedistribution,
  Mode,
  NokiaCliStyle,
  PathResult,
  ReliefSuggestion,
  LspReservation,
  SimulationResult,
  WorkspaceMode,
} from "../types";

export interface SavedLsp {
  name: string;
  source: string;
  destination: string;
  mode: Mode;
  requiredBwMbps: number;
  maxHops: number;
  primary: PathResult | null;
  backup: PathResult | null;
  createdAt: string;
}

export interface ImpactDiff {
  primaryLatencyDeltaMs: number;
  primaryHopDelta: number;
}

export interface FlexAlgoDefinition {
  id: number; // 128-255
  name: string;
  minBwMbps: number;
  maxHops: number;
  excludeSrlg: boolean;
}

const STARTER_FLEX_ALGOS: Record<number, FlexAlgoDefinition> = {
  128: { id: 128, name: "Low-Latency", minBwMbps: 0, maxHops: 50, excludeSrlg: false },
  129: { id: 129, name: "High-Bandwidth", minBwMbps: 10_000, maxHops: 50, excludeSrlg: false },
  130: { id: 130, name: "Diverse-Path", minBwMbps: 0, maxHops: 50, excludeSrlg: true },
};

interface AppState {
  /** Workspace mode: LSP Design vs Traffic Simulation (separate from tunnel signaling mode). */
  workspaceMode: WorkspaceMode;
  neIds: string[];
  source: string;
  destination: string;
  requiredBwMbps: number;
  maxHops: number;
  mode: Mode;
  flexAlgoId: number | null;
  flexAlgos: Record<number, FlexAlgoDefinition>;
  enforceSrlgDiversity: boolean;
  /** When true, backend CSPF rejects paths that violate NE role hierarchy rules. */
  enforceRoles: boolean;
  /** Allow a higher-latency primary to obtain a node-disjoint backup. */
  tradeoffMode: "percent" | "absolute";
  tradeoffValue: number;
  failedNeIds: string[];
  failedLinkKeys: string[];
  lastCompute: ComputeResponse | null;
  baselinePrimary: PathResult | null;
  impact: ImpactDiff | null;
  heatmapEnabled: boolean;
  /** When false, map does not show NE labels (overrides zoom-based label logic). */
  mapLabelsEnabled: boolean;
  reservations: LspReservation[];
  lastImportSummary: ImportSummary | null;
  nokiaCliStyle: NokiaCliStyle;
  lspName: string;
  /** Nokia RSVP-TE (Forward tab): optional path name prefix (X) and LSP names (Y/Z); empty = server default. */
  nokiaRsvpLabelXForward: string;
  nokiaRsvpLabelYForward: string;
  nokiaRsvpLabelZForward: string;
  /** Nokia RSVP-TE (Reverse tab): optional path name prefix (X) and LSP names (Y/Z); empty = server default. */
  nokiaRsvpLabelXReverse: string;
  nokiaRsvpLabelYReverse: string;
  nokiaRsvpLabelZReverse: string;
  /** @deprecated Revert tabs inherit Forward path labels; kept for persisted project compatibility. */
  nokiaRsvpLabelXForwardRevert: string;
  /** @deprecated Revert tabs inherit Forward path labels; kept for persisted project compatibility. */
  nokiaRsvpLabelYForwardRevert: string;
  /** @deprecated Revert tabs inherit Forward path labels; kept for persisted project compatibility. */
  nokiaRsvpLabelZForwardRevert: string;
  /** @deprecated Revert tabs inherit Reverse path labels; kept for persisted project compatibility. */
  nokiaRsvpLabelXReverseRevert: string;
  /** @deprecated Revert tabs inherit Reverse path labels; kept for persisted project compatibility. */
  nokiaRsvpLabelYReverseRevert: string;
  /** @deprecated Revert tabs inherit Reverse path labels; kept for persisted project compatibility. */
  nokiaRsvpLabelZReverseRevert: string;
  timeHour: number;
  /** When false, backup trade-off slider is ignored and 0% extra primary latency is used. */
  backupTradeoffEnabled: boolean;
  /** Monolithic legacy config (forward+reverse) for viewer/copy. */
  monolithicConfig: string | null;
  /** Left floating panel expanded (project file + localStorage). */
  floatingPanelOpen: boolean;
  activePanelTab: "constraints" | "lspDetails";
  configOverlayOpen: boolean;
  lsps: Record<string, SavedLsp>;

  // ---- Traffic Simulation slice (standalone what-if mode) ----
  trafficActiveTab: "failures" | "scenario" | "advisor";

  // Failure Simulation (tab: failures)
  trafficFailedElements: FailedTrafficElement[];
  trafficSelectionMode: "none" | "addFailure";
  trafficFailureResult: SimulationResult | null;

  // Scenario Builder (tab: scenario)
  scenarioFailedElements: FailedTrafficElement[];
  scenarioSelectionMode: "none" | "addFailure";
  scenarioResult: SimulationResult | null;
  trafficOverlayVisible: boolean;
  trafficHeatmapEnabled: boolean;
  manualRedistributions: ManualRedistribution[];
  reliefSuggestions: ReliefSuggestion[];
  injectedFlows: InjectedFlow[];
  trafficEnforceRoles: boolean;
  scenarioPathOptions: Record<string, Array<{ path_nodes: string[]; path_edges: string[]; total_latency_ms: number }>>;
  scenarioPathPreview: { flowId: string; idx: number } | null;

  setWorkspaceMode: (m: WorkspaceMode) => void;
  setTrafficActiveTab: (t: "failures" | "scenario" | "advisor") => void;

  addTrafficFailure: (e: FailedTrafficElement) => void;
  removeTrafficFailure: (e: FailedTrafficElement) => void;
  clearTrafficFailures: () => void;
  setTrafficSelectionMode: (m: "none" | "addFailure") => void;
  setTrafficFailureResult: (r: SimulationResult | null) => void;

  addScenarioFailure: (e: FailedTrafficElement) => void;
  removeScenarioFailure: (e: FailedTrafficElement) => void;
  clearScenarioFailures: () => void;
  setScenarioSelectionMode: (m: "none" | "addFailure") => void;
  setScenarioResult: (r: SimulationResult | null) => void;
  setTrafficOverlayVisible: (v: boolean) => void;
  setTrafficHeatmapEnabled: (v: boolean) => void;
  toggleTrafficHeatmap: () => void;
  setManualRedistributions: (r: ManualRedistribution[]) => void;
  setReliefSuggestions: (s: ReliefSuggestion[]) => void;
  setInjectedFlows: (f: InjectedFlow[]) => void;
  setTrafficEnforceRoles: (v: boolean) => void;
  setScenarioPathOptions: (
    flowId: string,
    paths: Array<{ path_nodes: string[]; path_edges: string[]; total_latency_ms: number }>,
  ) => void;
  setScenarioPathPreview: (p: { flowId: string; idx: number } | null) => void;
  setNeIds: (ids: string[]) => void;
  setSource: (v: string) => void;
  setDestination: (v: string) => void;
  setRequiredBw: (v: number) => void;
  setMaxHops: (v: number) => void;
  setMode: (m: Mode) => void;
  setFlexAlgoId: (id: number | null) => void;
  upsertFlexAlgo: (d: FlexAlgoDefinition) => void;
  deleteFlexAlgo: (id: number) => void;
  setEnforceSrlgDiversity: (v: boolean) => void;
  setEnforceRoles: (v: boolean) => void;
  setTradeoffMode: (m: "percent" | "absolute") => void;
  setTradeoffValue: (v: number) => void;
  toggleHeatmap: () => void;
  setMapLabelsEnabled: (v: boolean) => void;
  setReservations: (r: LspReservation[]) => void;
  setLastCompute: (c: ComputeResponse | null) => void;
  /** Clear displayed paths/config without running compute (e.g. after endpoint change). */
  clearLspComputeState: () => void;
  setBaselinePrimary: (p: PathResult | null) => void;
  setImpact: (i: ImpactDiff | null) => void;
  failNe: (id: string) => void;
  failLink: (key: string) => void;
  clearFailures: () => void;
  setLastImportSummary: (s: ImportSummary | null) => void;
  setNokiaCliStyle: (s: NokiaCliStyle) => void;
  setLspName: (s: string) => void;
  setNokiaRsvpLabelXForward: (s: string) => void;
  setNokiaRsvpLabelYForward: (s: string) => void;
  setNokiaRsvpLabelZForward: (s: string) => void;
  setNokiaRsvpLabelXReverse: (s: string) => void;
  setNokiaRsvpLabelYReverse: (s: string) => void;
  setNokiaRsvpLabelZReverse: (s: string) => void;
  setNokiaRsvpLabelXForwardRevert: (s: string) => void;
  setNokiaRsvpLabelYForwardRevert: (s: string) => void;
  setNokiaRsvpLabelZForwardRevert: (s: string) => void;
  setNokiaRsvpLabelXReverseRevert: (s: string) => void;
  setNokiaRsvpLabelYReverseRevert: (s: string) => void;
  setNokiaRsvpLabelZReverseRevert: (s: string) => void;
  /** Clear all six Nokia user-define fields (after a fresh compute). */
  clearNokiaRsvpUserLabels: () => void;
  setTimeHour: (h: number) => void;
  setBackupTradeoffEnabled: (v: boolean) => void;
  setMonolithicConfig: (s: string | null) => void;
  setFloatingPanelOpen: (v: boolean) => void;
  setActivePanelTab: (t: "constraints" | "lspDetails") => void;
  setConfigOverlayOpen: (v: boolean) => void;
  upsertLsp: (lsp: SavedLsp) => void;
  deleteLsp: (name: string) => void;
  clearLsps: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      workspaceMode: "lsp",
      neIds: [],
      source: "",
      destination: "",
      requiredBwMbps: 0,
      maxHops: 25,
      mapLabelsEnabled: true,
      mode: "rsvp_te",
      flexAlgoId: null,
      flexAlgos: STARTER_FLEX_ALGOS,
      enforceSrlgDiversity: true,
      enforceRoles: true,
      tradeoffMode: "percent" as const,
      tradeoffValue: 0,
      failedNeIds: [],
      failedLinkKeys: [],
      lastCompute: null,
      baselinePrimary: null,
      impact: null,
      heatmapEnabled: false,
      backupTradeoffEnabled: true,
      floatingPanelOpen: true,
      activePanelTab: "constraints" as const,
      configOverlayOpen: false,
      reservations: [],
      lastImportSummary: null,
      nokiaCliStyle: "classic",
      lspName: "LSP-1",
      nokiaRsvpLabelXForward: "",
      nokiaRsvpLabelYForward: "",
      nokiaRsvpLabelZForward: "",
      nokiaRsvpLabelXReverse: "",
      nokiaRsvpLabelYReverse: "",
      nokiaRsvpLabelZReverse: "",
      nokiaRsvpLabelXForwardRevert: "",
      nokiaRsvpLabelYForwardRevert: "",
      nokiaRsvpLabelZForwardRevert: "",
      nokiaRsvpLabelXReverseRevert: "",
      nokiaRsvpLabelYReverseRevert: "",
      nokiaRsvpLabelZReverseRevert: "",
      timeHour: 0,
      monolithicConfig: null,
      lsps: {},

      trafficFailedElements: [],
      trafficSelectionMode: "none",
      trafficFailureResult: null,
      trafficActiveTab: "failures",
      scenarioFailedElements: [],
      scenarioSelectionMode: "none",
      scenarioResult: null,
      trafficOverlayVisible: true,
      trafficHeatmapEnabled: true,
      manualRedistributions: [],
      reliefSuggestions: [],
      injectedFlows: [],
      trafficEnforceRoles: true,
      scenarioPathOptions: {},
      scenarioPathPreview: null,

      setWorkspaceMode: (m) =>
        set((s) => ({
          workspaceMode: m,
          trafficSelectionMode: "none",
          scenarioSelectionMode: "none",
          // Close config overlay when leaving LSP Design.
          configOverlayOpen: m === "traffic" ? false : s.configOverlayOpen,
        })),
      setTrafficActiveTab: (t) => set({ trafficActiveTab: t }),
      addTrafficFailure: (e) =>
        set((s) => ({
          trafficFailedElements: s.trafficFailedElements.some((x) => x.type === e.type && x.id === e.id)
            ? s.trafficFailedElements
            : [...s.trafficFailedElements, e],
        })),
      removeTrafficFailure: (e) =>
        set((s) => ({
          trafficFailedElements: s.trafficFailedElements.filter((x) => !(x.type === e.type && x.id === e.id)),
        })),
      clearTrafficFailures: () => set({ trafficFailedElements: [], trafficFailureResult: null, trafficSelectionMode: "none" }),
      setTrafficSelectionMode: (m) => set({ trafficSelectionMode: m }),
      setTrafficFailureResult: (r) => set({ trafficFailureResult: r, trafficOverlayVisible: true }),

      addScenarioFailure: (e) =>
        set((s) => ({
          scenarioFailedElements: s.scenarioFailedElements.some((x) => x.type === e.type && x.id === e.id)
            ? s.scenarioFailedElements
            : [...s.scenarioFailedElements, e],
        })),
      removeScenarioFailure: (e) =>
        set((s) => ({
          scenarioFailedElements: s.scenarioFailedElements.filter((x) => !(x.type === e.type && x.id === e.id)),
        })),
      clearScenarioFailures: () => set({ scenarioFailedElements: [], scenarioResult: null, scenarioSelectionMode: "none" }),
      setScenarioSelectionMode: (m) => set({ scenarioSelectionMode: m }),
      setScenarioResult: (r) => set({ scenarioResult: r, trafficOverlayVisible: true }),
      setTrafficOverlayVisible: (v) => set({ trafficOverlayVisible: v }),
      setTrafficHeatmapEnabled: (v) => set({ trafficHeatmapEnabled: v }),
      toggleTrafficHeatmap: () => set((s) => ({ trafficHeatmapEnabled: !s.trafficHeatmapEnabled })),
      setManualRedistributions: (r) => set({ manualRedistributions: r }),
      setReliefSuggestions: (s) => set({ reliefSuggestions: s }),
      setInjectedFlows: (f) => set({ injectedFlows: f }),
      setTrafficEnforceRoles: (v) => set({ trafficEnforceRoles: v }),
      setScenarioPathOptions: (flowId, paths) =>
        set((s) => ({
          scenarioPathOptions: { ...s.scenarioPathOptions, [flowId]: paths },
        })),
      setScenarioPathPreview: (p) => set({ scenarioPathPreview: p }),
      setNeIds: (ids) => set({ neIds: ids }),
      setSource: (v) => set({ source: v }),
      setDestination: (v) => set({ destination: v }),
      setRequiredBw: (v) => set({ requiredBwMbps: v }),
      setMaxHops: (v) => set({ maxHops: v }),
      setMode: (m) => set({ mode: m }),
      setFlexAlgoId: (id) =>
        set((s) => {
          if (id === null) {
            return { flexAlgoId: null };
          }
          const def = s.flexAlgos[id];
          if (!def) {
            return { flexAlgoId: id };
          }
          return {
            flexAlgoId: id,
            requiredBwMbps: def.minBwMbps,
            maxHops: def.maxHops,
            enforceSrlgDiversity: def.excludeSrlg,
          };
        }),
      upsertFlexAlgo: (d) => set((s) => ({ flexAlgos: { ...s.flexAlgos, [d.id]: d } })),
      deleteFlexAlgo: (id) =>
        set((s) => {
          const next = { ...s.flexAlgos };
          delete next[id];
          const flexAlgoId = s.flexAlgoId === id ? null : s.flexAlgoId;
          return { flexAlgos: next, flexAlgoId };
        }),
      setEnforceSrlgDiversity: (v) => set({ enforceSrlgDiversity: v }),
      setEnforceRoles: (v) => set({ enforceRoles: v }),
      setTradeoffMode: (m) => set({ tradeoffMode: m }),
      setTradeoffValue: (v) => set({ tradeoffValue: v }),
      toggleHeatmap: () => set((s) => ({ heatmapEnabled: !s.heatmapEnabled })),
      setMapLabelsEnabled: (v) => set({ mapLabelsEnabled: v }),
      setReservations: (r) => set({ reservations: r }),
      setLastCompute: (c) => set({ lastCompute: c }),
      clearLspComputeState: () =>
        set({
          lastCompute: null,
          monolithicConfig: null,
          baselinePrimary: null,
          impact: null,
          configOverlayOpen: false,
        }),
      setBaselinePrimary: (p) => set({ baselinePrimary: p }),
      setImpact: (i) => set({ impact: i }),
      failNe: (id) =>
        set((s) => ({
          failedNeIds: s.failedNeIds.includes(id) ? s.failedNeIds : [...s.failedNeIds, id],
        })),
      failLink: (key) =>
        set((s) => ({
          failedLinkKeys: s.failedLinkKeys.includes(key) ? s.failedLinkKeys : [...s.failedLinkKeys, key],
        })),
      clearFailures: () => set({ failedNeIds: [], failedLinkKeys: [] }),
      setLastImportSummary: (s) => set({ lastImportSummary: s }),
      setNokiaCliStyle: (s) => set({ nokiaCliStyle: s }),
      setLspName: (s) => set({ lspName: s }),
      setNokiaRsvpLabelXForward: (s) => set({ nokiaRsvpLabelXForward: s }),
      setNokiaRsvpLabelYForward: (s) => set({ nokiaRsvpLabelYForward: s }),
      setNokiaRsvpLabelZForward: (s) => set({ nokiaRsvpLabelZForward: s }),
      setNokiaRsvpLabelXReverse: (s) => set({ nokiaRsvpLabelXReverse: s }),
      setNokiaRsvpLabelYReverse: (s) => set({ nokiaRsvpLabelYReverse: s }),
      setNokiaRsvpLabelZReverse: (s) => set({ nokiaRsvpLabelZReverse: s }),
      setNokiaRsvpLabelXForwardRevert: (s) => set({ nokiaRsvpLabelXForwardRevert: s }),
      setNokiaRsvpLabelYForwardRevert: (s) => set({ nokiaRsvpLabelYForwardRevert: s }),
      setNokiaRsvpLabelZForwardRevert: (s) => set({ nokiaRsvpLabelZForwardRevert: s }),
      setNokiaRsvpLabelXReverseRevert: (s) => set({ nokiaRsvpLabelXReverseRevert: s }),
      setNokiaRsvpLabelYReverseRevert: (s) => set({ nokiaRsvpLabelYReverseRevert: s }),
      setNokiaRsvpLabelZReverseRevert: (s) => set({ nokiaRsvpLabelZReverseRevert: s }),
      clearNokiaRsvpUserLabels: () =>
        set({
          nokiaRsvpLabelXForward: "",
          nokiaRsvpLabelYForward: "",
          nokiaRsvpLabelZForward: "",
          nokiaRsvpLabelXReverse: "",
          nokiaRsvpLabelYReverse: "",
          nokiaRsvpLabelZReverse: "",
          nokiaRsvpLabelXForwardRevert: "",
          nokiaRsvpLabelYForwardRevert: "",
          nokiaRsvpLabelZForwardRevert: "",
          nokiaRsvpLabelXReverseRevert: "",
          nokiaRsvpLabelYReverseRevert: "",
          nokiaRsvpLabelZReverseRevert: "",
        }),
      setTimeHour: (h) => set({ timeHour: h }),
      setBackupTradeoffEnabled: (v) => set({ backupTradeoffEnabled: v }),
      setMonolithicConfig: (s) => set({ monolithicConfig: s }),
      setFloatingPanelOpen: (v) => set({ floatingPanelOpen: v }),
      setActivePanelTab: (t) => set({ activePanelTab: t }),
      setConfigOverlayOpen: (v) => set({ configOverlayOpen: v }),
      upsertLsp: (lsp) =>
        set((s) => ({
          lsps: { ...s.lsps, [lsp.name]: lsp },
        })),
      deleteLsp: (name) =>
        set((s) => {
          const next = { ...s.lsps };
          delete next[name];
          return { lsps: next };
        }),
      clearLsps: () => set({ lsps: {} }),
    }),
    {
      name: "prism-ui",
      version: 5,
      /** Drop stale monolithic text from v1: it was saved without `lastCompute`, so it could be outdated. */
      migrate: (persisted, fromVersion) => {
        if (fromVersion < 2 && persisted && typeof persisted === "object") {
          const p = persisted as { monolithicConfig?: unknown };
          delete p.monolithicConfig;
        }
        if (fromVersion < 3 && persisted && typeof persisted === "object") {
          const p = persisted as Record<string, unknown>;
          const x = typeof p.nokiaRsvpLabelX === "string" ? p.nokiaRsvpLabelX : "";
          const y = typeof p.nokiaRsvpLabelY === "string" ? p.nokiaRsvpLabelY : "";
          const z = typeof p.nokiaRsvpLabelZ === "string" ? p.nokiaRsvpLabelZ : "";
          if (typeof p.nokiaRsvpLabelXForward !== "string") p.nokiaRsvpLabelXForward = x;
          if (typeof p.nokiaRsvpLabelYForward !== "string") p.nokiaRsvpLabelYForward = y;
          if (typeof p.nokiaRsvpLabelZForward !== "string") p.nokiaRsvpLabelZForward = z;
          if (typeof p.nokiaRsvpLabelXReverse !== "string") p.nokiaRsvpLabelXReverse = x;
          if (typeof p.nokiaRsvpLabelYReverse !== "string") p.nokiaRsvpLabelYReverse = y;
          if (typeof p.nokiaRsvpLabelZReverse !== "string") p.nokiaRsvpLabelZReverse = z;
          delete p.nokiaRsvpLabelX;
          delete p.nokiaRsvpLabelY;
          delete p.nokiaRsvpLabelZ;
        }
        if (fromVersion < 4 && persisted && typeof persisted === "object") {
          const p = persisted as Record<string, unknown>;
          if (p.workspaceMode !== "lsp" && p.workspaceMode !== "traffic") {
            p.workspaceMode = "lsp";
          }
        }
        if (fromVersion < 5 && persisted && typeof persisted === "object") {
          const p = persisted as Record<string, unknown>;
          if (typeof p.nokiaRsvpLabelXForwardRevert !== "string") p.nokiaRsvpLabelXForwardRevert = "";
          if (typeof p.nokiaRsvpLabelYForwardRevert !== "string") p.nokiaRsvpLabelYForwardRevert = "";
          if (typeof p.nokiaRsvpLabelZForwardRevert !== "string") p.nokiaRsvpLabelZForwardRevert = "";
          if (typeof p.nokiaRsvpLabelXReverseRevert !== "string") p.nokiaRsvpLabelXReverseRevert = "";
          if (typeof p.nokiaRsvpLabelYReverseRevert !== "string") p.nokiaRsvpLabelYReverseRevert = "";
          if (typeof p.nokiaRsvpLabelZReverseRevert !== "string") p.nokiaRsvpLabelZReverseRevert = "";
        }
        return persisted as object;
      },
      partialize: (s) => ({
        workspaceMode: s.workspaceMode,
        source: s.source,
        destination: s.destination,
        requiredBwMbps: s.requiredBwMbps,
        maxHops: s.maxHops,
        mode: s.mode,
        flexAlgoId: s.flexAlgoId,
        flexAlgos: s.flexAlgos,
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
        timeHour: s.timeHour,
        heatmapEnabled: s.heatmapEnabled,
        floatingPanelOpen: s.floatingPanelOpen,
        activePanelTab: s.activePanelTab,
        lsps: s.lsps,
      }),
    },
  ),
);
