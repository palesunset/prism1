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

export type TradeoffMode = "percent" | "absolute";

export interface ComputeResponse {
  primary: PathResult | null;
  backup: PathResult | null;
  ecmp_paths: PathResult[];
  rejected_paths: RejectedPath[];
  pruned_edges: PrunedEdge[];
  warnings: string[];
  mode: Mode;
  time_hour?: number | null;
  /** Best valid primary (K-shortest) latency in ms, before any trade-off. */
  optimal_latency_ms?: number | null;
  /** Extra primary latency vs `optimal_latency_ms` when a suboptimal primary was chosen. */
  tradeoff_applied_ms?: number | null;
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

export type WorkspaceMode = "lsp" | "traffic";

export type FailedTrafficElement = { type: "link" | "node"; id: string };

export type TrafficFlow = {
  flow_id?: string;
  failed_link_id: string;
  source?: string;
  target?: string;
  volume_mbps: number;
  path_nodes: string[];
  path_edges: string[];
  path_latency_ms?: number;
  manual_override?: boolean;
  manual_volume_mbps?: number;
  manual_new_path_nodes?: string[];
  manual_new_path_edges?: string[];
  manual_extra_latency_ms?: number;
};

export type CongestedLink = {
  edge_id: string;
  before_util_pct: number;
  after_util_pct: number;
  delta_mbps: number;
  extra_bandwidth_mbps: number;
};

export type DisconnectedFlow = {
  failed_link_id: string;
  source: string;
  target: string;
  reason: string;
};

export type SimulationResult = {
  flows: TrafficFlow[];
  injected_flows?: InjectedFlowResult[];
  link_utilization_before_pct: Record<string, number>;
  link_utilization_after_pct: Record<string, number>;
  congested_links: CongestedLink[];
  disconnected_flows: DisconnectedFlow[];
};

export type InjectedFlow = {
  id: string;
  source_ne_id: string;
  dest_ne_id: string;
  volume_mbps: number;
};

export type InjectedFlowResult = {
  id: string;
  flow_id?: string;
  source_ne_id: string;
  dest_ne_id: string;
  volume_mbps: number;
  path_nodes?: string[];
  path_edges?: string[];
  path_latency_ms?: number;
  disconnected: boolean;
  reason?: string;
};

export type ManualRedistribution = {
  flowId: string;
  originalPath: string[];
  newPath: string[];
  volumeMbps: number;
};

export type ReliefRecommendation = {
  flow_id: string;
  volume_mbps: number;
  current_path: string[];
  new_path: string[];
  extra_latency_ms: number;
  new_utilization: Record<string, number>;
  reason: string;
};

export type ReliefSuggestion = {
  congested_link_id: string;
  original_utilization_pct: number;
  recommendations: ReliefRecommendation[];
};

export type TrafficReliefResponse = {
  suggestions: ReliefSuggestion[];
};
