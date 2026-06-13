import type { SavedPositions } from "./layoutCache";
import type { Mode, NokiaCliStyle, TopologyPayload } from "../types";
import type { FlexAlgoDefinition, SavedLsp } from "../store/useAppStore";

/** Pick saved LSP paths to restore after opening a project file. */
export function findRestoredLsp(
  lsps: SavedLsp[],
  lspName: string,
  source: string,
  destination: string,
): SavedLsp | null {
  return (
    lsps.find((l) => l.name === lspName && l.primary) ??
    lsps.find((l) => l.source === source && l.destination === destination && l.primary) ??
    null
  );
}

export interface ProjectUiState {
  source: string;
  destination: string;
  requiredBwMbps: number;
  maxHops: number;
  mode: Mode;
  flexAlgoId?: number | null;
  enforceSrlgDiversity?: boolean;
  /** When true, CSPF rejects paths that violate NE role hierarchy rules. */
  enforceRoles?: boolean;
  /** Backup trade-off: percent of optimal or absolute ms. */
  tradeoffMode?: "percent" | "absolute";
  tradeoffValue?: number;
  backupTradeoffEnabled?: boolean;
  nokiaCliStyle: NokiaCliStyle;
  lspName: string;
  /** Nokia RSVP-TE monolithic naming (legacy single set); optional for older project files. */
  nokiaRsvpLabelX?: string;
  nokiaRsvpLabelY?: string;
  nokiaRsvpLabelZ?: string;
  /** Nokia RSVP-TE naming per direction; optional for older project files. */
  nokiaRsvpLabelXForward?: string;
  nokiaRsvpLabelYForward?: string;
  nokiaRsvpLabelZForward?: string;
  nokiaRsvpLabelXReverse?: string;
  nokiaRsvpLabelYReverse?: string;
  nokiaRsvpLabelZReverse?: string;
  nokiaRsvpLabelXForwardRevert?: string;
  nokiaRsvpLabelYForwardRevert?: string;
  nokiaRsvpLabelZForwardRevert?: string;
  nokiaRsvpLabelXReverseRevert?: string;
  nokiaRsvpLabelYReverseRevert?: string;
  nokiaRsvpLabelZReverseRevert?: string;
  /** PRISM: left panel expanded. */
  floatingPanelOpen?: boolean;
  /** PRISM: constraints vs LSP details tab. */
  activePanelTab?: "constraints" | "lspDetails";
}

export interface ProjectFileV1 {
  version: 1;
  exportedAt: string;
  topology: TopologyPayload;
  layoutPositions: SavedPositions | null;
  ui: ProjectUiState;
  lsps: SavedLsp[];
  flex_algos?: Record<number, FlexAlgoDefinition>;
}

export function downloadJson(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readTextFile(file: File): Promise<string> {
  return await file.text();
}

export function isProjectFileV1(x: unknown): x is ProjectFileV1 {
  if (!x || typeof x !== "object") {
    return false;
  }
  const o = x as Record<string, unknown>;
  if (o.version !== 1 || typeof o.exportedAt !== "string" || typeof o.topology !== "object" || o.topology === null) {
    return false;
  }
  if (typeof o.ui !== "object" || o.ui === null) {
    return false;
  }
  const ui = o.ui as Record<string, unknown>;
  return (
    typeof ui.source === "string" &&
    typeof ui.destination === "string" &&
    typeof ui.mode === "string" &&
    typeof ui.lspName === "string"
  );
}

export function topologyToProjectPayload(topology: TopologyPayload): {
  nes: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
} {
  const nes = topology.nodes.map((n) => {
    const d = n.data;
    return {
      ne_id: String(d.id),
      loopback_ipv4: String(d.loopback_ipv4 ?? ""),
      site: String(d.site ?? "default"),
      vendor: String(d.vendor ?? "nokia"),
      loopback_ipv6: d.loopback_ipv6 ? String(d.loopback_ipv6) : null,
      node_sid: d.node_sid ?? null,
      role: String(d.role ?? "P_RTR"),
    };
  });
  const links = topology.edges.map((e) => {
    const d = e.data;
    return {
      source: String(d.source),
      target: String(d.target),
      latency_ms: Number(d.latency_ms ?? 0),
      bandwidth_mbps: Number(d.bandwidth_mbps ?? 0),
      reservable_bw_mbps: Number(d.reservable_bw_mbps ?? d.bandwidth_mbps ?? 0),
      interface_src: String(d.interface_src ?? "") || null,
      interface_dst: String(d.interface_dst ?? "") || null,
    };
  });
  return { nes, links };
}

