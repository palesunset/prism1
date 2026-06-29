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
  address_family?: 'ipv4' | 'ipv6';
  v6_range_start?: string | null;
  v6_range_end?: string | null;
  hostname: string | null;
  mac_address: string | null;
  gateway: string | null;
  dhcp_scope: string | null;
  ptr_record: string | null;
  parent_subnet_id: string | null;
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
  totalIps: number | null;
  usableHosts: number | null;
  usedHosts: number;
  reservedHosts: number;
  freeIps: number | null;
  utilizationPercent: number | null;
  status: IpamStatus;
  address_family?: 'ipv4' | 'ipv6';
};

export type IpamInventoryMatch = {
  id: string;
  network_element: string;
  vendor?: string | null;
  model?: string | null;
  ip_address?: string | null;
  status?: string | null;
  site_name?: string | null;
};

export type IpamInventoryCrossCheck = {
  reachable: boolean;
  matches: IpamInventoryMatch[];
  warnings: { type: string; message: string; suggestion?: string }[];
};

export type IpamValidateResult = {
  allowed: boolean;
  outcome: 'allow' | 'warn' | 'block';
  error?: string;
  valid?: boolean;
  parsed?: {
    normalized: string;
    family?: 'ipv4' | 'ipv6';
    network?: string;
    broadcast?: string;
    prefix?: number;
    usableHosts?: number;
    role: string;
  };
  conflicts?: IpamConflict[];
  warnings?: { type: string; message: string; suggestion?: string }[];
  blocking?: IpamConflict[];
  inventory?: IpamInventoryCrossCheck;
};

export type IpamIntegrityStatus = 'valid' | 'conflict' | 'warning';

export type IpamEfficiencyMetrics = {
  percent: number | null;
  usedHosts: number;
  usableHosts: number;
  registeredHosts?: number;
  subnetsWithHosts?: number;
  applicableSubnets: number;
  totalSubnets: number;
};

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
    efficiencyPercent: number | null;
    efficiencyIpv4: IpamEfficiencyMetrics;
    efficiencyIpv6: IpamEfficiencyMetrics;
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
    alertPercent?: number;
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
  | 'REJECTED'
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
  rejected_reason?: string | null;
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
  rejectedRequests?: IpamWorkflow[];
  staleRequests?: IpamWorkflow[];
  history: IpamWorkflowLogEntry[];
};

export type IpamSettingsResponse = {
  settings: { key: string; value: string }[];
  utilizationAlertPercent: number;
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
  | 'decommission'
  | 'reopen';

export type IpamCapabilities = {
  product: string;
  apiVersion: string;
  ipv6: boolean;
  inventoryCrossCheck: boolean;
  phases: Record<string, { name: string; status: string; features: string[] }>;
  endpoints: string[];
};

export type IpamPicklists = {
  projects: string[];
  vlans: string[];
  locations: string[];
};

export type IpamHealth = {
  status: string;
  service: string;
  version: string;
  authRequired?: boolean;
  adminRequired?: boolean;
  dialect?: string;
  db?: string;
  error?: string;
};

const BASE = '/api/ipam';

function authHeaders(method: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody || (method !== 'GET' && method !== 'HEAD')) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const key = localStorage.getItem('prism-ipam-api-key');
    if (key) headers.Authorization = `Bearer ${key}`;
    const admin = localStorage.getItem('prism-ipam-admin-key');
    if (admin) headers['X-Ipam-Admin-Key'] = admin;
  } catch {
    /* ignore */
  }
  return headers;
}

async function ipamFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const hasBody = init?.body != null && init.body !== '';
  const headers = { ...authHeaders(method, hasBody), ...(init?.headers as Record<string, string> | undefined) };
  return fetch(`${BASE}${path}`, { ...init, headers });
}

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

export async function fetchHealth(): Promise<IpamHealth> {
  return parseJson(await ipamFetch('/health'));
}

export async function fetchCapabilities(): Promise<IpamCapabilities> {
  return parseJson(await ipamFetch('/capabilities'));
}

export async function fetchPicklists(): Promise<IpamPicklists> {
  return parseJson(await ipamFetch('/picklists'));
}

export async function fetchSettings(): Promise<IpamSettingsResponse> {
  return parseJson(await ipamFetch('/settings'));
}

export async function updateSettings(payload: { utilization_alert_percent?: number }): Promise<IpamSettingsResponse> {
  return parseJson(await ipamFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }));
}

export async function fetchRecords(params?: {
  status?: string;
  type?: string;
  project?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ records: IpamRecord[]; total: number; page?: number; pageSize?: number }> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.type) sp.set('type', params.type);
  if (params?.project) sp.set('project', params.project);
  if (params?.q) sp.set('q', params.q);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
  const q = sp.toString();
  return parseJson(await ipamFetch(`/records${q ? `?${q}` : ''}`));
}

export async function fetchAllRecords(params?: {
  status?: string;
  type?: string;
  project?: string;
  q?: string;
}): Promise<{ records: IpamRecord[]; total: number }> {
  const pageSize = 500;
  let page = 1;
  let all: IpamRecord[] = [];
  let total = 0;
  for (;;) {
    const data = await fetchRecords({ ...params, page, pageSize });
    all = all.concat(data.records);
    total = data.total;
    if (all.length >= total || data.records.length === 0) break;
    page += 1;
  }
  return { records: all, total };
}

export async function downloadIpamFile(path: string, filename: string): Promise<void> {
  const res = await ipamFetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(formatApiError(err, res.statusText));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function createRecord(payload: Partial<IpamRecord>): Promise<{ record: IpamRecord; conflicts?: IpamConflict[] }> {
  return parseJson(await ipamFetch('/records', {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

export async function updateRecord(id: string, payload: Partial<IpamRecord>): Promise<{ record: IpamRecord; conflicts?: IpamConflict[] }> {
  return parseJson(await ipamFetch(`/records/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }));
}

export async function deleteRecord(id: string, opts?: { cascade?: boolean }): Promise<void> {
  const q = opts?.cascade ? '?cascade=true' : '';
  await parseJson<void>(await ipamFetch(`/records/${id}${q}`, { method: 'DELETE' }));
}

export async function bulkUpdateStatus(ids: string[], status: IpamStatus): Promise<{ count: number }> {
  return parseJson(await ipamFetch('/records/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
  }));
}

export async function searchIp(query: string): Promise<IpamSearchResult> {
  return parseJson(await ipamFetch('/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  }));
}

export async function fetchDashboard(): Promise<SubnetDashboard[]> {
  const data = await parseJson<{ subnets: SubnetDashboard[] }>(await ipamFetch('/dashboard'));
  return data.subnets;
}

export async function importVlsmPlan(plan: unknown, project?: string, parent_subnet_id?: string | null): Promise<{ created: IpamRecord[]; errors: { address: string; error: string }[]; project: string }> {
  return parseJson(await ipamFetch('/import/vlsm', {
    method: 'POST',
    body: JSON.stringify({ plan, project, parent_subnet_id }),
  }));
}

export async function exportJson(): Promise<{ exported_at: string; records: IpamRecord[]; analytics?: IpamAnalytics }> {
  return parseJson(await ipamFetch('/export/json'));
}

export async function validateRecord(
  payload: Partial<IpamRecord> & { exclude_id?: string; inventory_crosscheck?: boolean },
): Promise<IpamValidateResult> {
  return parseJson(await ipamFetch('/validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

export async function fetchInventoryCrossCheck(
  address: string,
  hostname?: string | null,
): Promise<IpamInventoryCrossCheck> {
  const sp = new URLSearchParams({ address });
  if (hostname) sp.set('hostname', hostname);
  return parseJson(await ipamFetch(`/crosscheck/inventory?${sp.toString()}`));
}

export async function fetchIntegrityAudit(): Promise<IpamIntegrityAudit> {
  return parseJson(await ipamFetch('/integrity/audit'));
}

export async function simulateVlsmImport(plan: unknown, project?: string): Promise<IpamVlsmSimulation> {
  return parseJson(await ipamFetch('/integrity/simulate/vlsm', {
    method: 'POST',
    body: JSON.stringify({ plan, project }),
  }));
}

export async function fetchAnalytics(): Promise<IpamAnalytics> {
  return parseJson(await ipamFetch('/analytics'));
}

export async function scanConflicts(): Promise<IpamConflictScan> {
  return parseJson(await ipamFetch('/conflicts/scan'));
}

export async function fetchSubnetDetail(id: string): Promise<IpamSubnetDetail> {
  return parseJson(await ipamFetch(`/subnets/${id}`));
}

export async function fetchNextIp(subnetId: string): Promise<{ subnet: string; nextIp: string | null }> {
  return parseJson(await ipamFetch(`/subnets/${subnetId}/next-ip`));
}

export async function bulkImportCsv(csv: string): Promise<{ created: IpamRecord[]; errors: { row?: number; address: string; error: string }[] }> {
  return parseJson(await ipamFetch('/import/csv', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  }));
}

export async function fetchAudit(limit = 100): Promise<{
  entries: IpamAuditEntry[];
  workflowEntries: IpamWorkflowLogEntry[];
  unifiedCount: number;
}> {
  return parseJson(await ipamFetch(`/audit?limit=${limit}`));
}

export type IpamBackupBundle = {
  exported_at: string;
  schema_version: number;
  records: IpamRecord[];
  workflows?: IpamWorkflow[];
  workflow_history?: IpamWorkflowLogEntry[];
  audit?: IpamAuditEntry[];
  settings?: { key: string; value: string }[];
};

export async function fetchBackupBundle(): Promise<IpamBackupBundle> {
  return parseJson(await ipamFetch('/backup'));
}

export async function restoreBackupBundle(bundle: IpamBackupBundle): Promise<{
  restored: number;
  workflows?: number;
  workflow_history?: number;
  audit?: number;
}> {
  return parseJson(await ipamFetch('/restore', {
    method: 'POST',
    body: JSON.stringify(bundle),
  }));
}

export function setIpamApiKey(key: string | null) {
  if (key) localStorage.setItem('prism-ipam-api-key', key);
  else localStorage.removeItem('prism-ipam-api-key');
}

export function setIpamAdminKey(key: string | null) {
  if (key) localStorage.setItem('prism-ipam-admin-key', key);
  else localStorage.removeItem('prism-ipam-admin-key');
}

export function getIpamApiKey(): string {
  try {
    return localStorage.getItem('prism-ipam-api-key') ?? '';
  } catch {
    return '';
  }
}

export function getIpamAdminKey(): string {
  try {
    return localStorage.getItem('prism-ipam-admin-key') ?? '';
  } catch {
    return '';
  }
}

export async function fetchWorkflowDashboard(): Promise<IpamWorkflowDashboard> {
  return parseJson(await ipamFetch('/workflow/dashboard'));
}

export async function fetchWorkflows(params?: { state?: string; q?: string }): Promise<IpamWorkflow[]> {
  const sp = new URLSearchParams();
  if (params?.state) sp.set('state', params.state);
  if (params?.q) sp.set('q', params.q);
  const q = sp.toString();
  const data = await parseJson<{ workflows: IpamWorkflow[] }>(await ipamFetch(`/workflow${q ? `?${q}` : ''}`));
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
  netlens?: NetLensWorkflowPayload;
}): Promise<{ workflow: IpamWorkflow }> {
  return parseJson(await ipamFetch('/workflow', {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

export async function attachWorkflowNetLens(
  id: string,
  netlens: NetLensWorkflowPayload,
  actor?: string,
): Promise<{ workflow: IpamWorkflow }> {
  return parseJson(await ipamFetch(`/workflow/${id}/netlens`, {
    method: 'POST',
    body: JSON.stringify({ netlens, actor }),
  }));
}

export async function workflowAction(
  id: string,
  action: WorkflowAction,
  options?: { actor?: string; reason?: string; payload?: Record<string, unknown> },
): Promise<{ workflow: IpamWorkflow; ipamRecord?: IpamRecord }> {
  return parseJson(await ipamFetch(`/workflow/${id}/action`, {
    method: 'POST',
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
    case 'REJECTED':
      return 'bg-rose-500/20 text-rose-200 ring-rose-500/30';
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
