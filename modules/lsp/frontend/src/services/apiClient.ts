import axios from "axios";
import type {
  ComputeResponse,
  ImportSummary,
  NokiaCliStyle,
  TrafficReliefResponse,
  SimulationResult,
  TopologyPayload,
} from "../types";
import type { Mode, PathResult, LspReservation } from "../types";

const client = axios.create({
  baseURL: "/api/lsp",
  timeout: 30_000,
});

/** Heavy CSPF / config generation on large topologies may exceed the default timeout. */
const LONG_TIMEOUT_MS = 120_000;

export async function importTopology(files: { nes: File; links: File }): Promise<ImportSummary> {
  const fd = new FormData();
  fd.append("nes_file", files.nes);
  fd.append("links_file", files.links);
  const res = await client.post<ImportSummary>("/import", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export function errorDetail(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as {
      detail?: string | Array<{ msg?: string; loc?: unknown }>;
      error?: string;
    };
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d))).join("; ");
    }
    if (typeof data?.detail === "string") {
      return data.detail;
    }
    if (typeof data?.error === "string" && typeof data?.detail === "string") {
      return `${data.error}: ${data.detail}`;
    }
    return err.message || "Request failed";
  }
  return err instanceof Error ? err.message : "Unexpected error";
}

export async function fetchTopology(): Promise<TopologyPayload | null> {
  try {
    const res = await client.get<TopologyPayload>("/topology");
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      return null;
    }
    throw err;
  }
}

export async function computePaths(body: {
  source_ne_id: string;
  destination_ne_id: string;
  flex_algo_id?: number | null;
  required_bw_mbps?: number | null;
  max_hops: number;
  mode: Mode;
  enforce_srlg_diversity?: boolean;
  enforce_roles?: boolean;
  time_hour?: number | null;
  failed_ne_ids: string[];
  failed_link_keys: string[];
  tradeoff_mode?: "percent" | "absolute";
  tradeoff_value?: number;
}): Promise<ComputeResponse> {
  const res = await client.post<ComputeResponse>("/compute", body, { timeout: LONG_TIMEOUT_MS });
  return res.data;
}

export async function openProjectTopology(payload: {
  nes: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
}): Promise<ImportSummary> {
  const res = await client.post<ImportSummary>("/project/open", payload);
  return res.data;
}

/** Optional Nokia RSVP-TE naming (X=path match/prefix, Y=primary LSP, Z=backup LSP). Omitted/empty: server default. */
export type NokiaRsvpExportNames = {
  nokia_path_name_prefix?: string | null;
  nokia_lsp_name_y?: string | null;
  nokia_lsp_name_z?: string | null;
  nokia_path_name_prefix_forward?: string | null;
  nokia_lsp_name_y_forward?: string | null;
  nokia_lsp_name_z_forward?: string | null;
  nokia_path_name_prefix_reverse?: string | null;
  nokia_lsp_name_y_reverse?: string | null;
  nokia_lsp_name_z_reverse?: string | null;
  nokia_path_name_prefix_forward_revert?: string | null;
  nokia_lsp_name_y_forward_revert?: string | null;
  nokia_lsp_name_z_forward_revert?: string | null;
  nokia_path_name_prefix_reverse_revert?: string | null;
  nokia_lsp_name_y_reverse_revert?: string | null;
  nokia_lsp_name_z_reverse_revert?: string | null;
};

export function nokiaRsvpNamesFromInput(x: string, y: string, z: string): NokiaRsvpExportNames {
  // Legacy: one global set of names (kept for backward compatibility).
  const o: NokiaRsvpExportNames = {};
  if (x.trim()) o.nokia_path_name_prefix = x.trim();
  if (y.trim()) o.nokia_lsp_name_y = y.trim();
  if (z.trim()) o.nokia_lsp_name_z = z.trim();
  return o;
}

export function nokiaRsvpNamesForDirection(
  direction: "forward" | "reverse",
  x: string,
  y: string,
  z: string,
): NokiaRsvpExportNames {
  const o: NokiaRsvpExportNames = {};
  const xt = x.trim();
  const yt = y.trim();
  const zt = z.trim();
  if (direction === "forward") {
    if (xt) o.nokia_path_name_prefix_forward = xt;
    if (yt) o.nokia_lsp_name_y_forward = yt;
    if (zt) o.nokia_lsp_name_z_forward = zt;
    return o;
  }
  if (xt) o.nokia_path_name_prefix_reverse = xt;
  if (yt) o.nokia_lsp_name_y_reverse = yt;
  if (zt) o.nokia_lsp_name_z_reverse = zt;
  return o;
}

/** Revert sections use Forward / Reverse tab labels via server fallback — do not send separate revert overrides. */
export function nokiaRsvpNamesForRevertDirection(): NokiaRsvpExportNames {
  return {};
}

export type ExportMonolithicPayload = {
  lsp_name: string;
  mode: Mode;
  flex_algo_id?: number | null;
  primary: PathResult;
  backup: PathResult | null;
  reservations: LspReservation[];
  nokia_cli_style: NokiaCliStyle;
} & NokiaRsvpExportNames;

export async function exportClipboard(payload: ExportMonolithicPayload): Promise<string> {
  const res = await client.post<string>("/export/clipboard", payload, {
    timeout: LONG_TIMEOUT_MS,
    responseType: "text",
    transformResponse: (r) => r,
  });
  return typeof res.data === "string" ? res.data : String(res.data);
}

export async function exportMonolithic(payload: ExportMonolithicPayload): Promise<string> {
  const res = await client.post<string>("/export/monolithic", payload, {
    timeout: LONG_TIMEOUT_MS,
    responseType: "text",
    transformResponse: (r) => r,
  });
  return typeof res.data === "string" ? res.data : String(res.data);
}

export async function exportMonolithicSection(
  section: "forward" | "reverse" | "revert_forward" | "revert_reverse",
  payload: ExportMonolithicPayload,
): Promise<string> {
  const res = await client.post<string>(`/export/monolithic/section?section=${section}`, payload, {
    timeout: LONG_TIMEOUT_MS,
    responseType: "text",
    transformResponse: (r) => r,
  });
  return typeof res.data === "string" ? res.data : String(res.data);
}

export async function trafficSimulate(body: {
  failed_elements: Array<{ type: "link" | "node"; id: string }>;
  injected_flows?: Array<{ id: string; source_ne_id: string; dest_ne_id: string; volume_mbps: number }>;
  congestion_threshold_pct: number;
  manual_redistributions?: Array<{ flow_id: string; new_path: string[]; volume_mbps: number }>;
  enforce_roles?: boolean;
}): Promise<SimulationResult> {
  const res = await client.post<SimulationResult>("/traffic-simulate", body);
  return res.data;
}

export async function trafficRelief(body: {
  failed_elements: Array<{ type: "link" | "node"; id: string }>;
  congestion_threshold_pct: number;
  max_extra_latency_ms: number;
  max_suggestions_per_link: number;
  enforce_roles?: boolean;
}): Promise<TrafficReliefResponse> {
  const res = await client.post<TrafficReliefResponse>("/traffic-relief", body);
  return res.data;
}

export async function trafficPaths(body: {
  source_ne_id: string;
  dest_ne_id: string;
  failed_elements: Array<{ type: "link" | "node"; id: string }>;
  k: number;
}): Promise<{ paths: Array<{ path_nodes: string[]; path_edges: string[]; total_latency_ms: number }> }> {
  const res = await client.post<{ paths: Array<{ path_nodes: string[]; path_edges: string[]; total_latency_ms: number }> }>(
    "/traffic-paths",
    body,
  );
  return res.data;
}
