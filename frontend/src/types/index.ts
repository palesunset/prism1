export type Mode = "rsvp_te" | "sr_mpls" | "srv6";

export interface HopDetail {
  from_ne: string;
  to_ne: string;
  next_hop_ip: string | null;
  node_sid: number | null;
  srv6_sid: string | null;
  interface_src: string | null;
  interface_dst: string | null;
  latency_ms: number;
}

export interface PathResult {
  nodes: string[];
  edges: [string, string, number][];
  hops: HopDetail[];
  total_latency_ms: number;
  hop_count: number;
}

export interface RejectedPath {
  nodes: string[];
  reason: string;
  total_latency_ms: number | null;
  hop_count: number | null;
}

export interface PrunedEdge {
  source: string;
  target: string;
  edge_key: number;
  reason: string;
}

export interface ComputeResponse {
  primary: PathResult | null;
  backup: PathResult | null;
  ecmp_paths: PathResult[];
  rejected_paths: RejectedPath[];
  pruned_edges: PrunedEdge[];
  warnings: string[];
  mode: Mode;
  time_hour?: number | null;
}

export interface CsvRowIssue {
  file: string;
  row: number;
  field: string;
  message: string;
}

export interface ImportSummary {
  ne_count: number;
  link_count: number;
  sites: string[];
  invalid_rows: CsvRowIssue[];
  warnings: string[];
}

export type NokiaCliStyle = "classic" | "md";

export interface TopologyPayload {
  nodes: Array<{ data: Record<string, unknown> }>;
  edges: Array<{ data: Record<string, unknown> }>;
}

export interface LspReservation {
  name: string;
  primary_edges: [string, string, number][];
  required_bw_mbps: number;
}
