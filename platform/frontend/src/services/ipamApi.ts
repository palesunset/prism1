export type IpamRecordType = 'host' | 'subnet';
export type IpamStatus = 'free' | 'used' | 'reserved';

export type IpamRecord = {
  id: string;
  address: string;
  record_type: IpamRecordType;
  status: IpamStatus;
  project: string;
  vlan: string | null;
  location: string | null;
  description: string | null;
  cidr_prefix: number | null;
  range_start: number;
  range_end: number;
  created_at: string | null;
  updated_at: string | null;
};

export type IpamConflict = {
  type: string;
  message: string;
  existing?: IpamRecord;
  suggestion?: string;
  affectedRange?: string;
};

export type IpamSearchResult = {
  query: string;
  parsed: {
    network: string;
    broadcast: string;
    prefix: number;
    cidr: string;
    blockSize: number;
    usableHosts: number;
    firstUsable: string | null;
    lastUsable: string | null;
    role: string;
    usableRange: string;
  };
  assignmentStatus: string;
  exactMatches: IpamRecord[];
  containingSubnets: IpamRecord[];
  members: IpamRecord[];
  conflicts: IpamConflict[];
  membership: string;
};

export type SubnetDashboard = {
  id: string;
  address: string;
  project: string;
  location: string | null;
  vlan: string | null;
  network: string;
  broadcast: string;
  rangeLabel: string;
  totalIps: number;
  usableHosts: number;
  usedHosts: number;
  reservedHosts: number;
  freeIps: number;
  utilizationPercent: number;
  status: IpamStatus;
};

export type IpamValidateResult = {
  allowed: boolean;
  outcome: 'allow' | 'warn' | 'block';
  error?: string;
  valid?: boolean;
  parsed?: {
    normalized: string;
    network?: string;
    broadcast?: string;
    prefix?: number;
    usableHosts?: number;
    role: string;
  };
  conflicts?: IpamConflict[];
  warnings?: { type: string; message: string; suggestion?: string }[];
  blocking?: IpamConflict[];
};

export type IpamIntegrityStatus = 'valid' | 'conflict' | 'warning';

export type IpamIntegrityAudit = {
  generatedAt: string;
  summary: {
    total: number;
    subnets: number;
    hosts: number;
    valid: number;
    conflicts: number;
    warnings: number;
    healthScore: number;
    efficiencyPercent: number;
    openConflictPairs: number;
  };
  conflicts: {
    severity: string;
    type: string;
    message: string;
    suggestion?: string | null;
    recordIds: string[];
    addresses: string[];
  }[];
  warnings: {
    type: string;
    message: string;
    recordId?: string;
    address?: string;
    suggestion?: string;
  }[];
  recordStatus: Record<string, { status: IpamIntegrityStatus; issues: { severity: string; type: string; message: string }[] }>;
};

export type IpamVlsmSimulation = {
  simulatedAt: string;
  project: string;
  summary: { total: number; safe: number; skipped: number };
  safe: { address: string; warnings: { type: string; message: string }[] }[];
  skipped: { address: string; reasons: string[] }[];
};

export type IpamFreeRange = {
  start: string;
  end: string;
  count: number;
};

export type IpamSubnetDetail = {
  subnet: IpamRecord;
  hosts: IpamRecord[];
  childSubnets: IpamRecord[];
  usableRange: string | null;
  freeRanges: IpamFreeRange[];
  nextSuggestedIp: string | null;
};

export type IpamConflictScan = {
  scannedAt: string;
  count: number;
  issues: {
    type: string;
    message: string;
    records: IpamRecord[];
    suggestion?: string;
  }[];
};

export type IpamAnalytics = {
  generatedAt: string;
  totals: {
    records: number;
    hosts: number;
    subnets: number;
    free: number;
    used: number;
    reserved: number;
  };
  utilization: {
    averagePercent: number;
    subnetsOver80: number;
    subnetsUnder20: number;
    highUtilizationSubnets: string[];
  };
  byProject: { project: string; records: number; subnets: number; hosts: number }[];
  subnetSummaries: SubnetDashboard[];
  openConflicts: number;
  recentAudit: IpamAuditEntry[];
};

export type IpamAuditEntry = {
  id: string;
  action: string;
  record_id: string | null;
  address: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type WorkflowState =
  | 'REQUESTED'
  | 'VALIDATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'RESERVED'
  | 'ACTIVE'
  | 'MODIFIED'
  | 'DECOMMISSIONED';

export type NetLensWorkflowPayload = {
  valid?: boolean;
  overlap?: boolean;
  conflicts?: string[];
  suggestion?: string;
  warnings?: string[];
  validation?: { status: 'valid' | 'invalid'; errors: string[]; summary: string };
  insights?: { overlaps: string[]; conflicts: string[]; suggestions: string[]; warnings: string[] };
  analysis?: Record<string, unknown>;
};

export type IpamWorkflow = {
  id: string;
  address: string;
  record_type: IpamRecordType;
  project: string;
  location: string | null;
  vlan: string | null;
  description: string | null;
  requester: string;
  state: WorkflowState;
  netlens_result: NetLensWorkflowPayload | null;
  ipam_record_id: string | null;
  override_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type IpamWorkflowLogEntry = {
  id: string;
  workflow_id: string;
  from_state: WorkflowState | null;
  to_state: WorkflowState;
  action: string;
  actor: string;
  reason: string | null;
  created_at: string;
};

export type IpamWorkflowDashboard = {
  generatedAt: string;
  counts: {
    total: number;
    queue: number;
    active: number;
    blocked: number;
    byState: Record<WorkflowState, number>;
  };
  requestsQueue: IpamWorkflow[];
  activeWorkflows: IpamWorkflow[];
  blockedRequests: IpamWorkflow[];
  history: IpamWorkflowLogEntry[];
};

export type WorkflowAction =
  | 'submit_approval'
  | 'approve'
  | 'reject'
  | 'override'
  | 'apply_suggestion'
  | 'modify'
  | 'reserve'
  | 'activate'
  | 'decommission';

const BASE = '/api/ipam';

function formatApiError(body: unknown, fallback: string): string {
  const err = body as { detail?: string; conflicts?: { message?: string; suggestion?: string }[] };
  const detail = err.detail ?? fallback;
  const suggestion = err.conflicts?.[0]?.suggestion;
  return suggestion ? `${detail} ${suggestion}` : detail;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(formatApiError(err, res.statusText));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchRecords(params?: {
  status?: string;
  type?: string;
  project?: string;
  q?: string;
}): Promise<IpamRecord[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.type) sp.set('type', params.type);
  if (params?.project) sp.set('project', params.project);
  if (params?.q) sp.set('q', params.q);
  const q = sp.toString();
  const data = await parseJson<{ records: IpamRecord[] }>(await fetch(`${BASE}/records${q ? `?${q}` : ''}`));
  return data.records;
}

export async function createRecord(payload: Partial<IpamRecord>): Promise<{ record: IpamRecord; conflicts?: IpamConflict[] }> {
  return parseJson(await fetch(`${BASE}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function updateRecord(id: string, payload: Partial<IpamRecord>): Promise<{ record: IpamRecord; conflicts?: IpamConflict[] }> {
  return parseJson(await fetch(`${BASE}/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function deleteRecord(id: string): Promise<void> {
  await parseJson<void>(await fetch(`${BASE}/records/${id}`, { method: 'DELETE' }));
}

export async function searchIp(query: string): Promise<IpamSearchResult> {
  return parseJson(await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }));
}

export async function fetchDashboard(): Promise<SubnetDashboard[]> {
  const data = await parseJson<{ subnets: SubnetDashboard[] }>(await fetch(`${BASE}/dashboard`));
  return data.subnets;
}

export async function importVlsmPlan(plan: unknown, project?: string): Promise<{ created: IpamRecord[]; errors: { address: string; error: string }[]; project: string }> {
  return parseJson(await fetch(`${BASE}/import/vlsm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, project }),
  }));
}

export async function exportJson(): Promise<{ exported_at: string; records: IpamRecord[]; analytics?: IpamAnalytics }> {
  return parseJson(await fetch(`${BASE}/export/json`));
}

export function exportCsvUrl(): string {
  return `${BASE}/export/csv`;
}

export function utilizationReportUrl(): string {
  return `${BASE}/reports/utilization.txt`;
}

export async function validateRecord(payload: Partial<IpamRecord> & { exclude_id?: string }): Promise<IpamValidateResult> {
  const res = await fetch(`${BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<IpamValidateResult>;
}

export async function fetchIntegrityAudit(): Promise<IpamIntegrityAudit> {
  return parseJson(await fetch(`${BASE}/integrity/audit`));
}

export function integrityReportUrl(): string {
  return `${BASE}/integrity/report.txt`;
}

export async function simulateVlsmImport(plan: unknown, project?: string): Promise<IpamVlsmSimulation> {
  return parseJson(await fetch(`${BASE}/integrity/simulate/vlsm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, project }),
  }));
}

export async function fetchAnalytics(): Promise<IpamAnalytics> {
  return parseJson(await fetch(`${BASE}/analytics`));
}

export async function scanConflicts(): Promise<IpamConflictScan> {
  return parseJson(await fetch(`${BASE}/conflicts/scan`));
}

export async function fetchSubnetDetail(id: string): Promise<IpamSubnetDetail> {
  return parseJson(await fetch(`${BASE}/subnets/${id}`));
}

export async function fetchNextIp(subnetId: string): Promise<{ subnet: string; nextIp: string | null }> {
  return parseJson(await fetch(`${BASE}/subnets/${subnetId}/next-ip`));
}

export async function bulkImportCsv(csv: string): Promise<{ created: IpamRecord[]; errors: { row?: number; address: string; error: string }[] }> {
  return parseJson(await fetch(`${BASE}/import/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv }),
  }));
}

export async function fetchAudit(limit = 100): Promise<IpamAuditEntry[]> {
  const data = await parseJson<{ entries: IpamAuditEntry[] }>(await fetch(`${BASE}/audit?limit=${limit}`));
  return data.entries;
}

export async function fetchWorkflowDashboard(): Promise<IpamWorkflowDashboard> {
  return parseJson(await fetch(`${BASE}/workflow/dashboard`));
}

export async function fetchWorkflows(params?: { state?: string; q?: string }): Promise<IpamWorkflow[]> {
  const sp = new URLSearchParams();
  if (params?.state) sp.set('state', params.state);
  if (params?.q) sp.set('q', params.q);
  const q = sp.toString();
  const data = await parseJson<{ workflows: IpamWorkflow[] }>(await fetch(`${BASE}/workflow${q ? `?${q}` : ''}`));
  return data.workflows;
}

export async function createWorkflowRequest(payload: {
  address: string;
  record_type?: IpamRecordType;
  project?: string;
  location?: string;
  vlan?: string;
  description?: string;
  requester?: string;
  reason?: string;
}): Promise<{ workflow: IpamWorkflow }> {
  return parseJson(await fetch(`${BASE}/workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function attachWorkflowNetLens(
  id: string,
  netlens: NetLensWorkflowPayload,
  actor?: string,
): Promise<{ workflow: IpamWorkflow }> {
  return parseJson(await fetch(`${BASE}/workflow/${id}/netlens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ netlens, actor }),
  }));
}

export async function workflowAction(
  id: string,
  action: WorkflowAction,
  options?: { actor?: string; reason?: string; payload?: Record<string, unknown> },
): Promise<{ workflow: IpamWorkflow; ipamRecord?: IpamRecord }> {
  return parseJson(await fetch(`${BASE}/workflow/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...options }),
  }));
}

export function workflowStateClass(state: WorkflowState): string {
  switch (state) {
    case 'REQUESTED':
      return 'bg-slate-500/20 text-slate-300 ring-slate-500/30';
    case 'VALIDATED':
      return 'bg-sky-500/20 text-sky-200 ring-sky-500/30';
    case 'PENDING_APPROVAL':
      return 'bg-amber-500/20 text-amber-200 ring-amber-500/30';
    case 'APPROVED':
      return 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/30';
    case 'RESERVED':
      return 'bg-violet-500/20 text-violet-200 ring-violet-500/30';
    case 'ACTIVE':
      return 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/30';
    case 'MODIFIED':
      return 'bg-cyan-500/20 text-cyan-200 ring-cyan-500/30';
    case 'DECOMMISSIONED':
      return 'bg-rose-500/20 text-rose-200 ring-rose-500/30';
    default:
      return 'bg-slate-500/20 text-slate-300 ring-slate-500/30';
  }
}

export function statusClass(status: IpamStatus): string {
  switch (status) {
    case 'free':
      return 'bg-slate-500/20 text-slate-300 ring-slate-500/30';
    case 'reserved':
      return 'bg-amber-500/20 text-amber-200 ring-amber-500/30';
    default:
      return 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/30';
  }
}
