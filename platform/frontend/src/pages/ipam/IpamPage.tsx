import clsx from 'clsx';
import {
  AlertTriangle,
  BarChart3,
  Database,
  Download,
  Globe,
  Home,
  Lock,
  Network,
  Plus,
  Search,
  Server,
  Shield,
  Upload,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { IpamRecord, IpamStatus } from '../../services/ipamApi';
import {
  downloadIpamFile,
  exportJson,
  simulateVlsmImport,
  fetchSettings,
  updateSettings,
  bulkUpdateStatus,
} from '../../services/ipamApi';
import { useIpamStore } from '../../store/useIpamStore';
import {
  filterDashboardByScope,
  scopeTotals,
} from '../../utils/ipamScope';
import {
  familyTotals,
  filterDashboardByFamily,
  filterRecordsByFamily,
  hostInSubnetRecord,
  sortRecordsByAddress,
  type IpAddressFamily,
} from '../../utils/ipamFamily';
import { efficiencyMetricsForFamily, formatAllocationEfficiency, formatUtilizationAverage } from '../../utils/ipamEfficiency';
import { IpamApiKeysPanel } from './IpamApiKeysPanel';
import { IpamAuditPanel } from './IpamAuditPanel';
import { IpamBackupRestorePanel } from './IpamBackupRestorePanel';
import { IpamWorkflowPanel } from './IpamWorkflowPanel';
import { IpamFamilyToggle } from './IpamFamilyToggle';
import { IpamHealthBadge } from './IpamHealthBadge';
import { IpamImportReport, type ImportRowError } from './IpamImportReport';
import { formToPayload, RecordForm, recordToForm } from './IpamRecordForm';
import { IpamScrollArea } from './IpamScrollArea';
import { IpamTabButton, IpamTabPanel, type IpamTabId } from './IpamTabButton';
import {
  DashboardScopeSection,
  DashboardFamilySection,
  looksLikeIpOrCidr,
  RecordSummaryRow,
  RegistryScopeSection,
  RegistryFamilySection,
  StatusBadge,
  SubnetDetailCard,
  SubnetFreeRangesList,
  SubnetHostAllocator,
  SubnetPicker,
} from './IpamViewComponents';

type TabId = IpamTabId;

export function IpamPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const familyParam = searchParams.get('family');
  const addressFamily: IpAddressFamily = familyParam === 'ipv6' ? 'ipv6' : 'ipv4';
  const [tab, setTabState] = useState<TabId>(tabParam && ['dashboard', 'registry', 'subnets', 'search', 'workflow', 'analytics', 'audit', 'system'].includes(tabParam) ? tabParam : 'dashboard');
  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    setSearchParams({ tab: next, family: addressFamily }, { replace: true });
  }, [setSearchParams, addressFamily]);
  const setAddressFamily = useCallback((family: IpAddressFamily) => {
    setSearchParams({ tab, family }, { replace: true });
    if (family === 'ipv6' || family === 'ipv4') {
      setSelectedSubnetId(null);
    }
  }, [setSearchParams, tab]);
  const [searchInput, setSearchInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterQ, setFilterQ] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importProject, setImportProject] = useState('');
  const [importCsv, setImportCsv] = useState('');
  const [importCsvFileName, setImportCsvFileName] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<ImportRowError[]>([]);
  const [importCreatedCount, setImportCreatedCount] = useState(0);
  const [vlsmDryRunMsg, setVlsmDryRunMsg] = useState<string | null>(null);
  const [selectedSubnetId, setSelectedSubnetId] = useState<string | null>(null);
  const [expandedSubnetIds, setExpandedSubnetIds] = useState<Set<string>>(() => new Set());
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<IpamStatus>('free');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [utilAlertPercent, setUtilAlertPercent] = useState(80);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const records = useIpamStore((s) => s.records);
  const dashboard = useIpamStore((s) => s.dashboard);
  const analytics = useIpamStore((s) => s.analytics);
  const integrityAudit = useIpamStore((s) => s.integrityAudit);
  const conflictScan = useIpamStore((s) => s.conflictScan);
  const subnetDetail = useIpamStore((s) => s.subnetDetail);
  const subnetDetailError = useIpamStore((s) => s.subnetDetailError);
  const auditLog = useIpamStore((s) => s.auditLog);
  const auditWorkflowLog = useIpamStore((s) => s.auditWorkflowLog);
  const recordsTotal = useIpamStore((s) => s.recordsTotal);
  const recordsLoading = useIpamStore((s) => s.recordsLoading);
  const loading = useIpamStore((s) => s.loading);
  const error = useIpamStore((s) => s.error);
  const searchResult = useIpamStore((s) => s.searchResult);
  const searchLoading = useIpamStore((s) => s.searchLoading);
  const loadInitial = useIpamStore((s) => s.loadInitial);
  const loadRecords = useIpamStore((s) => s.loadRecords);
  const loadPicklists = useIpamStore((s) => s.loadPicklists);
  const loadIntegrity = useIpamStore((s) => s.loadIntegrity);
  const loadAudit = useIpamStore((s) => s.loadAudit);
  const scanConflicts = useIpamStore((s) => s.scanConflicts);
  const loadSubnetDetail = useIpamStore((s) => s.loadSubnetDetail);
  const search = useIpamStore((s) => s.search);
  const addRecord = useIpamStore((s) => s.addRecord);
  const editRecord = useIpamStore((s) => s.editRecord);
  const removeRecord = useIpamStore((s) => s.removeRecord);
  const importVlsm = useIpamStore((s) => s.importVlsm);
  const bulkImportCsv = useIpamStore((s) => s.bulkImportCsv);
  const openWorkflowTabRequest = useIpamStore((s) => s.openWorkflowTabRequest);

  useEffect(() => {
    void loadInitial();
    void loadPicklists();
  }, [loadInitial, loadPicklists]);

  useEffect(() => {
    if (tab === 'registry' || tab === 'subnets' || tab === 'analytics' || tab === 'dashboard') {
      void loadRecords();
    }
  }, [tab, loadRecords]);

  useEffect(() => {
    if (openWorkflowTabRequest > 0) setTab('workflow');
  }, [openWorkflowTabRequest]);

  useEffect(() => {
    if (tab === 'audit' || tab === 'dashboard') {
      void loadIntegrity();
    }
    if (tab === 'system') {
      void loadAudit();
      void fetchSettings()
        .then((s) => setUtilAlertPercent(s.utilizationAlertPercent))
        .catch(() => undefined);
    }
  }, [tab, loadIntegrity, loadAudit]);

  const familyRecords = useMemo(() => filterRecordsByFamily(records, addressFamily), [records, addressFamily]);
  const familyDashboard = useMemo(() => filterDashboardByFamily(dashboard, addressFamily), [dashboard, addressFamily]);
  const ipv4Count = useMemo(() => filterRecordsByFamily(records, 'ipv4').length, [records]);
  const ipv6Count = useMemo(() => filterRecordsByFamily(records, 'ipv6').length, [records]);
  const familyScopeTotals = useMemo(() => familyTotals(records, addressFamily), [records, addressFamily]);

  const subnetRecords = useMemo(
    () => familyRecords.filter((r) => r.record_type === 'subnet').sort(sortRecordsByAddress),
    [familyRecords],
  );

  useEffect(() => {
    if (subnetRecords.length === 0) {
      if (selectedSubnetId) setSelectedSubnetId(null);
      return;
    }
    if (!selectedSubnetId) return;
    const valid = subnetRecords.some((s) => s.id === selectedSubnetId);
    if (!valid) {
      setSelectedSubnetId(null);
      return;
    }
    void loadSubnetDetail(selectedSubnetId);
  }, [selectedSubnetId, subnetRecords, loadSubnetDetail]);

  const handleRemoveRecord = useCallback(async (id: string) => {
    const record = records.find((r) => r.id === id);
    let cascade = false;
    if (record?.record_type === 'subnet') {
      const hosts = familyRecords.filter(
        (h) => h.record_type === 'host' && hostInSubnetRecord(h, record),
      );
      if (hosts.length > 0) {
        const ok = window.confirm(
          `Subnet ${record.address} has ${hosts.length} host(s). Delete subnet and all hosts inside it?`,
        );
        if (!ok) return;
        cascade = true;
      }
    }
    try {
      await removeRecord(id, { cascade });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      if (msg.includes('host') && !cascade) {
        const ok = window.confirm(`${msg}\n\nDelete with all hosts inside this subnet?`);
        if (ok) await removeRecord(id, { cascade: true });
      } else {
        window.alert(msg);
      }
    }
  }, [records, familyRecords, removeRecord]);

  const runSearch = useCallback(() => {
    void search(searchInput);
  }, [search, searchInput]);

  const utilThreshold = analytics?.utilization.alertPercent ?? utilAlertPercent;

  const familyAvgUtil = useMemo(
    () => formatUtilizationAverage(familyDashboard, addressFamily),
    [familyDashboard, addressFamily],
  );

  const privateTotals = useMemo(() => scopeTotals(familyRecords, 'private'), [familyRecords]);
  const publicTotals = useMemo(() => scopeTotals(familyRecords, 'public'), [familyRecords]);
  const privateDashboard = useMemo(() => filterDashboardByScope(familyDashboard, 'private'), [familyDashboard]);
  const publicDashboard = useMemo(() => filterDashboardByScope(familyDashboard, 'public'), [familyDashboard]);

  const activityEntries = useMemo(() => {
    const registry = auditLog.map((entry) => ({
      id: `r-${entry.id}`,
      kind: 'registry' as const,
      action: entry.action,
      address: entry.address,
      created_at: entry.created_at,
    }));
    const workflow = auditWorkflowLog.map((entry) => ({
      id: `w-${entry.id}`,
      kind: 'workflow' as const,
      action: entry.action,
      address: `${entry.from_state ?? '—'} → ${entry.to_state} · ${entry.actor}`,
      created_at: entry.created_at,
    }));
    return [...registry, ...workflow].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [auditLog, auditWorkflowLog]);

  const handleSubnetSelect = useCallback((id: string) => {
    setSelectedSubnetId(id);
    setTab('subnets');
  }, [setTab]);

  const runCsvImport = useCallback(async (csv: string) => {
    try {
      const result = await bulkImportCsv(csv);
      setImportCreatedCount(result.created.length);
      setImportErrors(result.errors);
      setImportMsg(`CSV: ${result.created.length} imported, ${result.errors.length} failed.`);
      if (result.errors.length === 0) {
        setImportCsv('');
        setImportCsvFileName(null);
      }
      void loadAudit();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'CSV import failed');
    }
  }, [bulkImportCsv, loadAudit]);

  const toggleRecordSelect = useCallback((id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyBulkStatus = useCallback(async () => {
    if (selectedRecordIds.size === 0) return;
    setBulkBusy(true);
    try {
      await bulkUpdateStatus([...selectedRecordIds], bulkStatus);
      setSelectedRecordIds(new Set());
      await loadRecords();
      await loadInitial();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Bulk update failed');
    } finally {
      setBulkBusy(false);
    }
  }, [selectedRecordIds, bulkStatus, loadRecords, loadInitial]);

  const projectMatches = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q || looksLikeIpOrCidr(q)) return [];
    const byProject = new Map<string, IpamRecord[]>();
    for (const r of familyRecords) {
      if (!r.project.toLowerCase().includes(q)) continue;
      const list = byProject.get(r.project) ?? [];
      list.push(r);
      byProject.set(r.project, list);
    }
    return [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [familyRecords, searchInput]);

  const orphanWarnings = useMemo(
    () => integrityAudit?.warnings.filter((w) => w.type === 'orphan_host') ?? [],
    [integrityAudit],
  );

  const analyticsSubnets = useMemo(
    () => (analytics ? filterDashboardByFamily(analytics.subnetSummaries, addressFamily) : []),
    [analytics, addressFamily],
  );

  const allocationEfficiency = useMemo(() => {
    if (!integrityAudit) return null;
    return formatAllocationEfficiency(
      efficiencyMetricsForFamily(integrityAudit.summary, addressFamily),
      addressFamily,
    );
  }, [integrityAudit, addressFamily]);

  const utilizationSummary = useMemo(
    () => formatUtilizationAverage(analyticsSubnets, addressFamily),
    [analyticsSubnets, addressFamily],
  );

  const analyticsByProject = useMemo(() => {
    const byProject = new Map<string, { project: string; records: number; subnets: number; hosts: number }>();
    for (const r of familyRecords) {
      const project = r.project?.trim() || '—';
      const row = byProject.get(project) ?? { project, records: 0, subnets: 0, hosts: 0 };
      row.records += 1;
      if (r.record_type === 'subnet') row.subnets += 1;
      else row.hosts += 1;
      byProject.set(project, row);
    }
    return [...byProject.values()].sort((a, b) => a.project.localeCompare(b.project));
  }, [familyRecords]);

  const editingRecord = editId ? records.find((r) => r.id === editId) : null;

  const toggleSubnetExpand = useCallback((subnetId: string) => {
    setExpandedSubnetIds((prev) => {
      const next = new Set(prev);
      if (next.has(subnetId)) next.delete(subnetId);
      else next.add(subnetId);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-950 text-slate-100">
      <header className="shrink-0 border-b border-white/10 bg-gray-950/90 px-3 py-2.5 sm:px-4 lg:px-6">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-950/40 text-indigo-300 sm:h-[3.25rem] sm:w-[3.25rem]">
              <Database className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-50 sm:text-lg">IPAM System</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">Core system of record</p>
              <div className="mt-1">
                <IpamHealthBadge />
              </div>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            <Home className="h-3.5 w-3.5" strokeWidth={2} />
            Home
          </Link>
        </div>
      </header>

      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
        <nav
          className="mb-0 shrink-0 border-b border-white/5 pb-2"
          role="tablist"
          aria-label="IPAM sections"
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Sections</p>
          <div className="flex flex-wrap gap-1.5">
            <IpamTabButton tabId="dashboard" active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>Dashboard</IpamTabButton>
            <IpamTabButton tabId="registry" active={tab === 'registry'} onClick={() => setTab('registry')}>Registry</IpamTabButton>
            <IpamTabButton tabId="subnets" active={tab === 'subnets'} onClick={() => setTab('subnets')}>Subnets</IpamTabButton>
            <IpamTabButton tabId="search" active={tab === 'search'} onClick={() => setTab('search')}>Search</IpamTabButton>
            <IpamTabButton tabId="workflow" active={tab === 'workflow'} onClick={() => setTab('workflow')}>IP Workflow</IpamTabButton>
            <IpamTabButton tabId="analytics" active={tab === 'analytics'} onClick={() => setTab('analytics')}>Analytics</IpamTabButton>
            <IpamTabButton tabId="audit" active={tab === 'audit'} onClick={() => setTab('audit')}>Audit</IpamTabButton>
            <IpamTabButton tabId="system" active={tab === 'system'} onClick={() => setTab('system')}>System Control</IpamTabButton>
          </div>
        </nav>

        <IpamFamilyToggle
          family={addressFamily}
          onChange={setAddressFamily}
          ipv4Count={ipv4Count}
          ipv6Count={ipv6Count}
        />

        {error ? (
          <div className="mb-3 shrink-0 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {loading && records.length === 0 ? (
          <p className="shrink-0 text-sm text-slate-500">Loading IP database…</p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <IpamTabPanel tabId="dashboard" active={tab === 'dashboard'}>
            <IpamScrollArea ariaLabel="IPAM dashboard" className="space-y-6">
              {analytics ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">{addressFamily === 'ipv6' ? 'IPv6 totals' : 'IPv4 totals'}</p>
                    <p className="text-xl font-semibold text-slate-100">{familyScopeTotals.records}</p>
                    <p className="text-[10px] text-slate-500">
                      {addressFamily === 'ipv4'
                        ? `${privateTotals.records} private · ${publicTotals.records} public`
                        : `${familyScopeTotals.subnets} subnets · ${familyScopeTotals.hosts} hosts`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/10 p-3">
                    <p className="text-[10px] uppercase text-slate-500">System Health</p>
                    <p className={clsx(
                      'text-xl font-semibold',
                      (integrityAudit?.summary.healthScore ?? 100) >= 90 ? 'text-emerald-300' : (integrityAudit?.summary.healthScore ?? 0) >= 70 ? 'text-amber-300' : 'text-rose-300',
                    )}>
                      {integrityAudit?.summary.healthScore ?? '—'}{integrityAudit ? '%' : ''}
                    </p>
                    <button type="button" onClick={() => setTab('audit')} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                      Open audit →
                    </button>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">Utilization ({addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'})</p>
                    <p className="text-xl font-semibold text-indigo-300">{familyAvgUtil.value}</p>
                    <p className="text-[10px] text-slate-500">{familyAvgUtil.detail}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">Status Mix ({addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'})</p>
                    <p className="text-sm text-slate-200">
                      <span className="text-emerald-300">{familyScopeTotals.used}</span> used ·{' '}
                      <span className="text-amber-300">{familyScopeTotals.reserved}</span> reserved ·{' '}
                      <span className="text-slate-400">{familyScopeTotals.free}</span> free
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-3">
                    <p className="text-[10px] uppercase text-slate-500">Conflicts</p>
                    <p className={clsx('text-xl font-semibold', analytics.openConflicts > 0 ? 'text-amber-300' : 'text-emerald-300')}>
                      {analytics.openConflicts}
                    </p>
                    <button type="button" onClick={() => { setTab('audit'); void scanConflicts(); }} className="text-[10px] text-indigo-400 hover:text-indigo-300">
                      View in audit →
                    </button>
                  </div>
                </div>
              ) : null}

              {addressFamily === 'ipv4' ? (
                <>
                  <DashboardScopeSection
                    title="Private IP Address Ranges"
                    icon={<Lock className="h-4 w-4 text-indigo-400" />}
                    totals={privateTotals}
                    subnets={privateDashboard}
                    emptyLabel="No private (RFC1918) IPv4 subnets registered."
                    accent="indigo"
                    onSubnetSelect={handleSubnetSelect}
                  />
                  <DashboardScopeSection
                    title="Public IP Address Ranges"
                    icon={<Globe className="h-4 w-4 text-sky-400" />}
                    totals={publicTotals}
                    subnets={publicDashboard}
                    emptyLabel="No public IPv4 subnets registered."
                    accent="sky"
                    onSubnetSelect={handleSubnetSelect}
                  />
                </>
              ) : (
                <DashboardFamilySection
                  title="IPv6 Address Space"
                  icon={<Network className="h-4 w-4 text-violet-400" />}
                  totals={familyScopeTotals}
                  subnets={familyDashboard}
                  emptyLabel="No IPv6 subnets registered."
                  accent="violet"
                  onSubnetSelect={handleSubnetSelect}
                />
              )}
            </IpamScrollArea>
          </IpamTabPanel>

          <IpamTabPanel tabId="registry" active={tab === 'registry'} className="flex h-full min-h-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                  placeholder="Filter registry…"
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                />
                {selectedRecordIds.size > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-950/20 px-2 py-1.5">
                    <span className="text-[10px] text-indigo-200">{selectedRecordIds.size} selected</span>
                    <select
                      className="rounded border border-white/10 bg-gray-950/80 px-2 py-1 text-xs text-slate-100"
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value as IpamStatus)}
                    >
                      <option value="free">Free</option>
                      <option value="used">Used</option>
                      <option value="reserved">Reserved</option>
                    </select>
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={() => void applyBulkStatus()}
                      className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      Apply status
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRecordIds(new Set())}
                      className="text-[10px] text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => { setShowAdd((v) => !v); setEditId(null); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add record
                </button>
                <span className="text-[10px] text-slate-500">
                  {recordsLoading
                    ? 'Loading registry…'
                    : `${familyRecords.length.toLocaleString()} loaded${recordsTotal > familyRecords.length ? ` of ${recordsTotal.toLocaleString()} total` : ''}`}
                </span>
              </div>

              {(showAdd || editingRecord) ? (
                <div className="max-h-[40vh] shrink-0 overflow-y-auto scrollbar-hidden">
                  {showAdd ? (
                    <RecordForm
                      key="new"
                      addressFamily={addressFamily}
                      submitLabel="Register"
                      onSubmit={async (data) => {
                        await addRecord(formToPayload(data));
                        setShowAdd(false);
                      }}
                      onCancel={() => setShowAdd(false)}
                    />
                  ) : null}
                  {editingRecord ? (
                    <RecordForm
                      key={editingRecord.id}
                      addressFamily={addressFamily}
                      recordId={editingRecord.id}
                      initial={recordToForm(editingRecord)}
                      submitLabel="Update"
                      onSubmit={async (data) => {
                        await editRecord(editingRecord.id, formToPayload(data));
                        setEditId(null);
                      }}
                      onCancel={() => setEditId(null)}
                    />
                  ) : null}
                </div>
              ) : null}

              <IpamScrollArea ariaLabel="Registry" fill={false} className="min-h-0 flex-1 space-y-4">
                {addressFamily === 'ipv4' ? (
                  <>
                    <RegistryScopeSection
                      title="Private IPv4 Ranges"
                      description="RFC1918 space (10/8, 172.16/12, 192.168/16) and nested hosts"
                      icon={<Lock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />}
                      scope="private"
                      records={familyRecords}
                      filterQ={filterQ}
                      expandedSubnetIds={expandedSubnetIds}
                      onToggleExpand={toggleSubnetExpand}
                      onEdit={(id) => { setEditId(id); setShowAdd(false); }}
                      onRemove={(id) => void handleRemoveRecord(id)}
                      selectedIds={selectedRecordIds}
                      onToggleSelect={toggleRecordSelect}
                    />
                    <RegistryScopeSection
                      title="Public IPv4 Ranges"
                      description="Globally routable IPv4 space and nested hosts"
                      icon={<Globe className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
                      scope="public"
                      records={familyRecords}
                      filterQ={filterQ}
                      expandedSubnetIds={expandedSubnetIds}
                      onToggleExpand={toggleSubnetExpand}
                      onEdit={(id) => { setEditId(id); setShowAdd(false); }}
                      onRemove={(id) => void handleRemoveRecord(id)}
                      selectedIds={selectedRecordIds}
                      onToggleSelect={toggleRecordSelect}
                    />
                  </>
                ) : (
                  <RegistryFamilySection
                    title="IPv6 Registry"
                    description="IPv6 subnets and host assignments (ULA, GUA, link-local excluded from RFC1918 split)"
                    icon={<Network className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />}
                    records={familyRecords}
                    filterQ={filterQ}
                    expandedSubnetIds={expandedSubnetIds}
                    onToggleExpand={toggleSubnetExpand}
                    onEdit={(id) => { setEditId(id); setShowAdd(false); }}
                    onRemove={(id) => void handleRemoveRecord(id)}
                    selectedIds={selectedRecordIds}
                    onToggleSelect={toggleRecordSelect}
                  />
                )}
              </IpamScrollArea>
          </IpamTabPanel>

          <IpamTabPanel tabId="subnets" active={tab === 'subnets'} className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-full min-h-0 flex-1 items-stretch gap-3 overflow-hidden lg:flex-row">
              <div className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden lg:w-72 xl:w-80">
                {subnetRecords.length === 0 ? (
                  <p className="text-sm text-slate-500">No {addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'} subnets. Add CIDR blocks in Registry or import via System Control.</p>
                ) : (
                  <SubnetPicker
                    subnets={subnetRecords}
                    selectedId={selectedSubnetId}
                    onSelect={setSelectedSubnetId}
                  />
                )}
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-gray-900/30 p-4">
                {subnetDetailError ? (
                  <div className="mb-2 shrink-0 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                    {subnetDetailError}
                  </div>
                ) : null}
                {!subnetDetail ? (
                  subnetDetailError ? null : (
                    <p className="text-sm text-slate-500">Select a subnet to view free space and allocate hosts.</p>
                  )
                ) : (
                  <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto text-xs">
                    <details
                      key={subnetDetail.subnet.id}
                      defaultOpen={subnetDetail.hosts.length === 0}
                      className="shrink-0 rounded-md border border-white/5 bg-gray-950/30 px-2.5 py-1.5"
                    >
                      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Subnet details · {subnetDetail.subnet.address}
                      </summary>
                      <div className="mt-2 space-y-2">
                        <SubnetDetailCard detail={subnetDetail} />
                        {subnetDetail.freeRanges.length > 0 ? (
                          <details className="rounded-md border border-white/5 bg-gray-950/30 px-2.5 py-1.5">
                            <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              Free ranges ({subnetDetail.freeRanges.length})
                            </summary>
                            <div className="mt-2">
                              <SubnetFreeRangesList ranges={subnetDetail.freeRanges} />
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </details>

                    <div className="flex min-h-0 flex-1 flex-col">
                      <SubnetHostAllocator
                        detail={subnetDetail}
                        allRecords={familyRecords}
                        onAllocate={async (payload) => {
                          await addRecord({
                            address: payload.address,
                            record_type: 'host',
                            status: payload.status,
                            project: payload.project,
                            vlan: payload.vlan,
                            location: payload.location,
                            description: payload.description,
                          });
                        }}
                        onRemove={async (id) => {
                          await handleRemoveRecord(id);
                        }}
                      />
                    </div>

                    {subnetDetail.childSubnets.length > 0 ? (
                      <details className="shrink-0 rounded-md border border-white/5 bg-gray-950/30 px-2.5 py-1.5">
                        <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Child subnets ({subnetDetail.childSubnets.length})
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {subnetDetail.childSubnets.map((c) => (
                            <li key={c.id} className="rounded-md border border-white/5 bg-gray-950/40 px-2 py-1.5">
                              <RecordSummaryRow record={c} tone="subnet" />
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </IpamTabPanel>

          <IpamTabPanel tabId="search" active={tab === 'search'}>
            <IpamScrollArea ariaLabel="IP search" className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-900/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                  placeholder={addressFamily === 'ipv6' ? 'IPv6, CIDR, or project name' : 'IPv4, CIDR, or project name'}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                />
                <button type="button" onClick={runSearch} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </div>

              {searchLoading ? <p className="text-sm text-slate-500">Searching…</p> : null}

              {!searchLoading && projectMatches.length > 0 && !looksLikeIpOrCidr(searchInput) ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Project mapping</p>
                  {projectMatches.map(([project, items]) => (
                    <div key={project} className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                      <p className="mb-2 font-medium text-indigo-200">{project}</p>
                      <div className="space-y-1">
                        {items.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono text-slate-200">{r.address}</span>
                            <span className="capitalize text-slate-500">{r.record_type}</span>
                            <StatusBadge status={r.status} />
                            <span className="text-slate-500">{r.location || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {searchResult ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4">
                    <p className="mb-2 font-mono text-sm text-indigo-200">{searchResult.query}</p>
                    <p className="text-xs text-slate-400">{searchResult.membership}</p>
                    <p className="mt-1 text-xs">
                      Assignment status:{' '}
                      <span className="font-medium capitalize text-slate-200">{searchResult.assignmentStatus}</span>
                    </p>
                  </div>

                  {searchResult.containingSubnets.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Parent subnet(s)</p>
                      {searchResult.containingSubnets.map((r) => (
                        <div key={r.id} className="mb-2 rounded-lg border border-white/10 bg-gray-900/40 p-3 text-xs">
                          <p className="font-mono text-indigo-200">{r.address}</p>
                          <p className="text-slate-400">{r.project} · {r.location ?? '—'} · <StatusBadge status={r.status} /></p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {searchResult.members.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Hosts in subnet ({searchResult.members.length})</p>
                      <div className="rounded-xl border border-white/10 bg-gray-900/40 p-3">
                        {searchResult.members.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1.5 text-xs last:border-0">
                            <span className="font-mono text-emerald-300">{r.address}</span>
                            <StatusBadge status={r.status} />
                            <span className="text-slate-400">{r.project || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4 text-xs">
                    <p className="mb-2 font-medium text-slate-400">Calculated Context</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      <p><span className="text-slate-500">Network:</span> <span className="font-mono text-slate-200">{searchResult.parsed.network}</span></p>
                      <p><span className="text-slate-500">Broadcast:</span> <span className="font-mono text-slate-200">{searchResult.parsed.broadcast}</span></p>
                      <p><span className="text-slate-500">Usable range:</span> <span className="font-mono text-emerald-300">{searchResult.parsed.usableRange}</span></p>
                      <p><span className="text-slate-500">Role:</span> <span className="capitalize text-slate-200">{searchResult.parsed.role}</span></p>
                    </div>
                  </div>

                  {searchResult.exactMatches.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Exact Matches</p>
                      {searchResult.exactMatches.map((r) => (
                        <div key={r.id} className="mb-2 rounded-lg border border-white/10 bg-gray-900/40 p-3 text-xs">
                          <p className="font-mono text-slate-200">{r.address}</p>
                          <p className="text-slate-400">{r.project} · {r.location ?? '—'} · VLAN {r.vlan ?? '—'} · <StatusBadge status={r.status} /></p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {searchResult.conflicts.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-400">Conflicts</p>
                      {searchResult.conflicts.map((c) => (
                        <div key={c.message} className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs">
                          <div className="mb-1 flex items-start gap-1.5 text-amber-200">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{c.message}</span>
                          </div>
                          {c.suggestion ? <p className="ml-5 text-slate-400">{c.suggestion}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </IpamScrollArea>
          </IpamTabPanel>

          <IpamTabPanel tabId="workflow" active={tab === 'workflow'}>
            <IpamScrollArea ariaLabel="IP workflow">
              <IpamWorkflowPanel addressFamily={addressFamily} />
            </IpamScrollArea>
          </IpamTabPanel>

          <IpamTabPanel tabId="analytics" active={tab === 'analytics'}>
            <IpamScrollArea ariaLabel="IPAM analytics" className="space-y-4">
              {!analytics ? (
                <p className="text-sm text-slate-500">Loading analytics…</p>
              ) : (
                <>
                  <p className="text-xs text-slate-500">
                    Showing {addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'} subnet analytics only
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <BarChart3 className="h-4 w-4 text-indigo-400" />
                      {new Date(analytics.generatedAt).toLocaleString()}
                    </div>
                    <button
                      type="button"
                      onClick={() => void downloadIpamFile('/reports/utilization.txt', 'ipam-utilization-report.txt')}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download utilization report
                    </button>
                  </div>

                  {integrityAudit && allocationEfficiency ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/10 p-4">
                        <p className="text-[10px] uppercase text-slate-500">
                          {addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'} allocation efficiency
                        </p>
                        <p className="text-2xl font-semibold text-indigo-300">{allocationEfficiency.value}</p>
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">{allocationEfficiency.detail}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                        <p className="text-[10px] uppercase text-slate-500">Average utilization ({addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'})</p>
                        <p className="text-2xl font-semibold text-emerald-300">{utilizationSummary.value}</p>
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">{utilizationSummary.detail}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                    <p className="mb-3 text-sm font-medium text-slate-300">By Project ({addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'})</p>
                    {analyticsByProject.length === 0 ? (
                      <p className="text-xs text-slate-500">No project assignments</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="py-1 text-left font-medium">Project</th>
                            <th className="py-1 text-right font-medium">Records</th>
                            <th className="py-1 text-right font-medium">Subnets</th>
                            <th className="py-1 text-right font-medium">Hosts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsByProject.map((p) => (
                            <tr key={p.project} className="border-t border-white/5">
                              <td className="py-1.5 text-slate-200">{p.project}</td>
                              <td className="py-1.5 text-right text-slate-300">{p.records}</td>
                              <td className="py-1.5 text-right text-slate-400">{p.subnets}</td>
                              <td className="py-1.5 text-right text-slate-400">{p.hosts}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {analytics.utilization.highUtilizationSubnets.filter((addr) =>
                    addressFamily === 'ipv6' ? addr.includes(':') : !addr.includes(':'),
                  ).length > 0 ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
                      <p className="mb-2 text-sm font-medium text-amber-200">High Utilization (≥{utilThreshold}%)</p>
                      {analytics.utilization.highUtilizationSubnets
                        .filter((addr) => (addressFamily === 'ipv6' ? addr.includes(':') : !addr.includes(':')))
                        .map((addr) => (
                        <p key={addr} className="font-mono text-xs text-slate-300">{addr}</p>
                      ))}
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                    <p className="mb-3 text-sm font-medium text-slate-300">
                      {addressFamily === 'ipv6' ? 'IPv6' : 'IPv4'} Subnet Utilization
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="py-1 text-left font-medium">Subnet</th>
                            <th className="py-1 text-right font-medium">Used</th>
                            <th className="py-1 text-right font-medium">Free</th>
                            <th className="py-1 text-right font-medium">Util %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsSubnets.map((s) => (
                            <tr key={s.id} className="border-t border-white/5">
                              <td className="py-1.5 font-mono text-indigo-200">{s.address}</td>
                              <td className="py-1.5 text-right text-emerald-300">{s.usedHosts}</td>
                              <td className="py-1.5 text-right text-slate-400">
                                {s.freeIps != null ? s.freeIps : s.address_family === 'ipv6' ? 'Large' : '—'}
                              </td>
                              <td className="py-1.5 text-right text-slate-300">
                                {s.utilizationPercent != null ? `${s.utilizationPercent}%` : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </IpamScrollArea>
          </IpamTabPanel>

          <IpamTabPanel tabId="audit" active={tab === 'audit'}>
            <IpamScrollArea ariaLabel="IPAM audit" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void scanConflicts()}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600/80 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                >
                  <Shield className="h-3.5 w-3.5" />
                  Run conflict detection
                </button>
                {conflictScan ? (
                  <span className={clsx('text-xs', conflictScan.count > 0 ? 'text-amber-300' : 'text-emerald-300')}>
                    {conflictScan.count === 0 ? 'No subnet/host pair conflicts' : `${conflictScan.count} conflict pair(s)`}
                  </span>
                ) : null}
              </div>
              {conflictScan && conflictScan.count > 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 text-xs">
                  {conflictScan.issues.map((issue) => (
                    <p key={issue.message} className="border-b border-white/5 py-1.5 last:border-0 text-slate-300">{issue.message}</p>
                  ))}
                </div>
              ) : null}
              {orphanWarnings.length > 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
                  <p className="mb-2 text-sm font-medium text-amber-200">Orphan IPs ({orphanWarnings.length})</p>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {orphanWarnings.map((w) => (
                      <li key={w.message} className="font-mono">{w.address ?? w.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <IpamAuditPanel
                audit={integrityAudit}
                loading={loading}
                onRescan={() => void loadIntegrity()}
                addressFamily={addressFamily}
              />
            </IpamScrollArea>
          </IpamTabPanel>

          <IpamTabPanel tabId="system" active={tab === 'system'}>
            <IpamScrollArea ariaLabel="System Control" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <IpamApiKeysPanel />
                <IpamBackupRestorePanel />
              </div>
              <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
                <div className="flex min-h-[18rem] flex-col rounded-xl border border-white/10 bg-gray-900/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-400" />
                    <p className="text-sm font-medium text-slate-300">Bulk CSV Import</p>
                  </div>
                  <p className="mb-2 text-[10px] text-slate-500">
                    Header: Address, Type, Status, Project, VLAN, Location, Description, Hostname, MAC Address, Gateway, DHCP Scope, PTR Record
                  </p>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadIpamFile('/import/csv/template', 'ipam-import-template.csv')}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300"
                    >
                      Download CSV template
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-gray-950/80 px-3 py-1.5 text-[10px] text-slate-300 hover:bg-white/5">
                      <Upload className="h-3.5 w-3.5" />
                      Upload CSV file
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          void file.text().then((text) => {
                            setImportCsv(text);
                            setImportCsvFileName(file.name);
                            setImportMsg(null);
                          });
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {importCsvFileName ? (
                      <span className="text-[10px] text-slate-500">{importCsvFileName}</span>
                    ) : null}
                  </div>
                  <textarea
                    className="mb-3 min-h-[100px] flex-1 w-full resize-y rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-[10px] text-slate-100 outline-none"
                    placeholder={'Address,Type,Status,Project\n10.2.1.0/24,subnet,reserved,Branch\n10.2.1.1,host,used,Router'}
                    value={importCsv}
                    onChange={(e) => {
                      setImportCsv(e.target.value);
                      if (importCsvFileName) setImportCsvFileName(null);
                    }}
                  />
                  <button
                    type="button"
                    disabled={!importCsv.trim()}
                    onClick={() => void runCsvImport(importCsv)}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 sm:w-auto"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Import CSV
                  </button>
                </div>

                <div className="flex min-h-[18rem] flex-col rounded-xl border border-violet-500/20 bg-violet-950/10 p-4">
                  <p className="mb-2 text-sm font-medium text-slate-300">VLSM Import</p>
                  <p className="mb-2 text-[10px] text-slate-500">Import VLSM Planner JSON export or paste plan results here.</p>
                  <input
                    className="mb-2 w-full rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-xs text-slate-100 outline-none"
                    placeholder="Project name (optional)"
                    value={importProject}
                    onChange={(e) => setImportProject(e.target.value)}
                  />
                  <textarea
                    className="mb-3 min-h-[100px] flex-1 w-full resize-y rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 font-mono text-[10px] text-slate-100 outline-none"
                    placeholder='{"baseNetwork":"10.0.0.0/24","subnets":[...]}'
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!importJson.trim()}
                      onClick={async () => {
                        try {
                          const plan = JSON.parse(importJson) as unknown;
                          const sim = await simulateVlsmImport(plan, importProject);
                          setVlsmDryRunMsg(`Dry run: ${sim.summary.safe} safe, ${sim.summary.skipped} skipped (of ${sim.summary.total})`);
                        } catch (e) {
                          setVlsmDryRunMsg(e instanceof Error ? e.message : 'Dry run failed');
                        }
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-950/30 disabled:opacity-50 sm:flex-none"
                    >
                      Dry run
                    </button>
                    <button
                      type="button"
                      disabled={!importJson.trim()}
                      onClick={async () => {
                        try {
                          const plan = JSON.parse(importJson) as unknown;
                          const result = await importVlsm(plan, importProject);
                          setImportCreatedCount(result.created);
                          setImportErrors(result.errors.map((e) => ({ address: e.address, error: e.error })));
                          setImportMsg(`VLSM: ${result.created} imported, ${result.errors.length} failed.`);
                          if (result.errors.length === 0) setImportJson('');
                          void loadAudit();
                        } catch (e) {
                          setImportMsg(e instanceof Error ? e.message : 'VLSM import failed');
                        }
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 sm:flex-none"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import VLSM plan
                    </button>
                  </div>
                  {vlsmDryRunMsg ? <p className="mt-2 text-xs text-violet-300">{vlsmDryRunMsg}</p> : null}
                </div>
              </div>

              {importMsg || importErrors.length > 0 || importCreatedCount > 0 ? (
                <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                  {importMsg ? <p className="mb-2 text-xs text-slate-400">{importMsg}</p> : null}
                  <IpamImportReport
                    title="Import Results"
                    createdCount={importCreatedCount}
                    errors={importErrors}
                    onDismiss={() => {
                      setImportErrors([]);
                      setImportCreatedCount(0);
                      setImportMsg(null);
                    }}
                  />
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
                <div className="flex min-h-[11rem] flex-col rounded-xl border border-white/10 bg-gray-900/50 p-4">
                  <p className="mb-1 text-sm font-medium text-slate-300">Export Database</p>
                  <p className="mb-3 flex-1 text-[10px] leading-relaxed text-slate-500">
                    Download registry exports, utilization report, and unified audit trail.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadIpamFile('/export/csv', 'ipam-export.csv')}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15"
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const data = await exportJson();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'ipam-export.json';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15"
                    >
                      <Download className="h-3.5 w-3.5" />
                      JSON + analytics
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadIpamFile('/reports/utilization.txt', 'ipam-utilization-report.txt')}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Utilization report
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadIpamFile('/audit/export.csv', 'ipam-unified-audit.csv')}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/15"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Unified audit CSV
                    </button>
                  </div>
                </div>

                <div className="flex min-h-[11rem] flex-col rounded-xl border border-white/10 bg-gray-900/50 p-4">
                  <p className="mb-1 text-sm font-medium text-slate-300">Settings</p>
                  <p className="mb-3 flex-1 text-[10px] leading-relaxed text-slate-500">
                    Subnets at or above this utilization % appear in high-util alerts and analytics.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] uppercase text-slate-500">Alert Threshold (%)</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="w-24 rounded-lg border border-white/10 bg-gray-950/80 px-2 py-1.5 text-sm text-slate-100 outline-none"
                        value={utilAlertPercent}
                        onChange={(e) => setUtilAlertPercent(Number(e.target.value) || 80)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        setSettingsMsg(null);
                        try {
                          const result = await updateSettings({ utilization_alert_percent: utilAlertPercent });
                          setUtilAlertPercent(result.utilizationAlertPercent);
                          setSettingsMsg('Settings saved.');
                          await loadInitial();
                        } catch (e) {
                          setSettingsMsg(e instanceof Error ? e.message : 'Could not save settings');
                        }
                      }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      Save
                    </button>
                  </div>
                  {settingsMsg ? <p className="mt-2 text-xs text-slate-400">{settingsMsg}</p> : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
                <p className="mb-3 text-sm font-medium text-slate-300">Activity Log</p>
                {activityEntries.length === 0 ? (
                  <p className="text-xs text-slate-500">No audit entries yet</p>
                ) : (
                  <IpamScrollArea ariaLabel="Activity log entries" fill={false} className="max-h-64 space-y-2" role="log">
                    {activityEntries.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-white/5 bg-gray-950/40 px-3 py-2 text-[10px]">
                        <span className="font-medium uppercase text-indigo-300">{entry.action}</span>
                        <span className="ml-2 rounded bg-white/5 px-1 py-0.5 text-[9px] uppercase text-slate-500">
                          {entry.kind}
                        </span>
                        {entry.address ? <span className="ml-2 font-mono text-slate-300">{entry.address}</span> : null}
                        <span className="ml-2 text-slate-600">{entry.created_at}</span>
                      </div>
                    ))}
                  </IpamScrollArea>
                )}
              </div>
            </IpamScrollArea>
          </IpamTabPanel>
        </div>
      </div>
    </div>
  );
}
