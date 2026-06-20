import type { TopologyPayload } from "../types";

const PREFIX = "lsp-cytoscape-layout:";

function fingerprint(topology: TopologyPayload): string {
  const nodeIds = topology.nodes.map((n) => String(n.data.id)).sort().join("|");
  const edgeIds = topology.edges.map((e) => String(e.data.id)).sort().join("|");
  return `${nodeIds}#${edgeIds}`.slice(0, 2000);
}

export function layoutStorageKey(topology: TopologyPayload): string {
  return `${PREFIX}${fingerprint(topology)}`;
}

export type SavedPositions = Record<string, { x: number; y: number }>;

export function loadLayoutPositions(topology: TopologyPayload): SavedPositions | null {
  try {
    const key = layoutStorageKey(topology);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SavedPositions;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLayoutPositions(topology: TopologyPayload, positions: SavedPositions): void {
  try {
    const key = layoutStorageKey(topology);
    localStorage.setItem(key, JSON.stringify(positions));
  } catch {
    /* quota / private mode */
  }
}
