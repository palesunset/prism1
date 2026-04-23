import axios from "axios";
import type {
  ComputeResponse,
  ImportSummary,
  NokiaCliStyle,
  TopologyPayload,
} from "../types";
import type { Mode, PathResult, LspReservation } from "../types";

const client = axios.create({
  baseURL: "/api",
  timeout: 30_000,
});

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

export async function fetchTopology(): Promise<TopologyPayload> {
  const res = await client.get<TopologyPayload>("/topology");
  return res.data;
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
  const res = await client.post<ComputeResponse>("/compute", body);
  return res.data;
}

export async function openProjectTopology(payload: {
  nes: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
}): Promise<ImportSummary> {
  const res = await client.post<ImportSummary>("/project/open", payload);
  return res.data;
}

export async function exportClipboard(payload: {
  lsp_name: string;
  mode: Mode;
  flex_algo_id?: number | null;
  primary: PathResult;
  backup: PathResult | null;
  reservations: LspReservation[];
  nokia_cli_style: NokiaCliStyle;
}): Promise<string> {
  const res = await client.post<string>("/export/clipboard", payload, {
    responseType: "text",
    transformResponse: (r) => r,
  });
  return typeof res.data === "string" ? res.data : String(res.data);
}

export async function exportZip(payload: {
  lsp_name: string;
  mode: Mode;
  flex_algo_id?: number | null;
  primary: PathResult;
  backup: PathResult | null;
  reservations: LspReservation[];
  nokia_cli_style: NokiaCliStyle;
}): Promise<Blob> {
  const res = await client.post("/export", payload, { responseType: "blob" });
  return res.data as Blob;
}
