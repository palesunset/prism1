import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ComputeResponse, ImportSummary, Mode, NokiaCliStyle, PathResult, LspReservation } from "../types";

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
  128: { id: 128, name: "Low-Latency", minBwMbps: 0, maxHops: 32, excludeSrlg: false },
  129: { id: 129, name: "High-Bandwidth", minBwMbps: 10_000, maxHops: 32, excludeSrlg: false },
  130: { id: 130, name: "Diverse-Path", minBwMbps: 0, maxHops: 32, excludeSrlg: true },
};

interface AppState {
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
  reservations: LspReservation[];
  lastImportSummary: ImportSummary | null;
  nokiaCliStyle: NokiaCliStyle;
  lspName: string;
  timeHour: number;
  lsps: Record<string, SavedLsp>;
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
  setReservations: (r: LspReservation[]) => void;
  setLastCompute: (c: ComputeResponse | null) => void;
  setBaselinePrimary: (p: PathResult | null) => void;
  setImpact: (i: ImpactDiff | null) => void;
  failNe: (id: string) => void;
  failLink: (key: string) => void;
  clearFailures: () => void;
  setLastImportSummary: (s: ImportSummary | null) => void;
  setNokiaCliStyle: (s: NokiaCliStyle) => void;
  setLspName: (s: string) => void;
  setTimeHour: (h: number) => void;
  upsertLsp: (lsp: SavedLsp) => void;
  deleteLsp: (name: string) => void;
  clearLsps: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      neIds: [],
      source: "",
      destination: "",
      requiredBwMbps: 0,
      maxHops: 32,
      mode: "rsvp_te",
      flexAlgoId: null,
      flexAlgos: STARTER_FLEX_ALGOS,
      enforceSrlgDiversity: true,
      enforceRoles: true,
      tradeoffMode: "percent" as const,
      tradeoffValue: 50,
      failedNeIds: [],
      failedLinkKeys: [],
      lastCompute: null,
      baselinePrimary: null,
      impact: null,
      heatmapEnabled: false,
      reservations: [],
      lastImportSummary: null,
      nokiaCliStyle: "classic",
      lspName: "LSP-1",
      timeHour: 0,
      lsps: {},
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
      setReservations: (r) => set({ reservations: r }),
      setLastCompute: (c) => set({ lastCompute: c }),
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
      setTimeHour: (h) => set({ timeHour: h }),
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
      name: "lsp-simulator-ui",
      partialize: (s) => ({
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
        nokiaCliStyle: s.nokiaCliStyle,
        lspName: s.lspName,
        timeHour: s.timeHour,
        heatmapEnabled: s.heatmapEnabled,
        lsps: s.lsps,
      }),
    },
  ),
);
