import { create } from 'zustand';
import type {
  IpamAnalytics,
  IpamAuditEntry,
  IpamConflictScan,
  IpamIntegrityAudit,
  IpamPicklists,
  IpamRecord,
  IpamSearchResult,
  IpamSubnetDetail,
  IpamValidateResult,
  IpamWorkflowLogEntry,
  SubnetDashboard,
} from '../services/ipamApi';
import * as api from '../services/ipamApi';

type IpamState = {
  records: IpamRecord[];
  recordsTotal: number;
  picklists: IpamPicklists | null;
  dashboard: SubnetDashboard[];
  analytics: IpamAnalytics | null;
  integrityAudit: IpamIntegrityAudit | null;
  conflictScan: IpamConflictScan | null;
  subnetDetail: IpamSubnetDetail | null;
  subnetDetailError: string | null;
  auditLog: IpamAuditEntry[];
  auditWorkflowLog: IpamWorkflowLogEntry[];
  loading: boolean;
  recordsLoading: boolean;
  error: string | null;
  searchResult: IpamSearchResult | null;
  searchLoading: boolean;
  loadInitial: () => Promise<void>;
  loadRecords: (opts?: { q?: string; page?: number }) => Promise<void>;
  loadPicklists: () => Promise<void>;
  loadDashboard: () => Promise<void>;
  loadAnalytics: () => Promise<void>;
  loadIntegrity: () => Promise<void>;
  loadAudit: () => Promise<void>;
  scanConflicts: () => Promise<IpamConflictScan>;
  loadSubnetDetail: (id: string) => Promise<void>;
  validateInput: (payload: Partial<IpamRecord> & { exclude_id?: string }) => Promise<IpamValidateResult>;
  search: (query: string) => Promise<void>;
  addRecord: (payload: Partial<IpamRecord>) => Promise<IpamRecord>;
  editRecord: (id: string, payload: Partial<IpamRecord>) => Promise<IpamRecord>;
  removeRecord: (id: string, opts?: { cascade?: boolean }) => Promise<void>;
  importVlsm: (plan: unknown, project?: string) => Promise<{ created: number; errors: { address: string; error: string }[]; createdList: IpamRecord[] }>;
  bulkImportCsv: (csv: string) => Promise<{ created: IpamRecord[]; errors: { row?: number; address: string; error: string }[] }>;
  clearSearch: () => void;
  clearSubnetDetail: () => void;
  openWorkflowTabRequest: number;
  requestWorkflowTab: () => void;
};

export const useIpamStore = create<IpamState>((set, get) => ({
  records: [],
  recordsTotal: 0,
  picklists: null,
  dashboard: [],
  analytics: null,
  integrityAudit: null,
  conflictScan: null,
  subnetDetail: null,
  subnetDetailError: null,
  auditLog: [],
  auditWorkflowLog: [],
  loading: false,
  recordsLoading: false,
  error: null,
  searchResult: null,
  searchLoading: false,

  loadInitial: async () => {
    set({ loading: true, error: null });
    try {
      const [dashboard, analytics] = await Promise.all([api.fetchDashboard(), api.fetchAnalytics()]);
      set({ dashboard, analytics, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Could not load IPAM. Is the IPAM API running on port 3003?',
      });
    }
  },

  loadRecords: async (opts) => {
    set({ recordsLoading: true, error: null });
    try {
      const data = await api.fetchAllRecords({ q: opts?.q });
      set({ records: data.records, recordsTotal: data.total, recordsLoading: false });
    } catch (e) {
      set({
        recordsLoading: false,
        error: e instanceof Error ? e.message : 'Could not load registry records.',
      });
    }
  },

  loadPicklists: async () => {
    try {
      const picklists = await api.fetchPicklists();
      set({ picklists });
    } catch {
      /* optional */
    }
  },

  loadDashboard: async () => {
    try {
      const dashboard = await api.fetchDashboard();
      set({ dashboard });
    } catch {
      /* ignore */
    }
  },

  loadAnalytics: async () => {
    try {
      const analytics = await api.fetchAnalytics();
      set({ analytics });
    } catch {
      /* ignore */
    }
  },

  loadIntegrity: async () => {
    try {
      const integrityAudit = await api.fetchIntegrityAudit();
      set({ integrityAudit });
    } catch {
      /* ignore */
    }
  },

  loadAudit: async () => {
    try {
      const data = await api.fetchAudit(200);
      set({ auditLog: data.entries, auditWorkflowLog: data.workflowEntries ?? [] });
    } catch {
      /* ignore */
    }
  },

  scanConflicts: async () => {
    const conflictScan = await api.scanConflicts();
    set({ conflictScan });
    return conflictScan;
  },

  loadSubnetDetail: async (id: string) => {
    set({ subnetDetailError: null });
    try {
      const subnetDetail = await api.fetchSubnetDetail(id);
      set({ subnetDetail, subnetDetailError: null });
    } catch (e) {
      set({
        subnetDetail: null,
        subnetDetailError: e instanceof Error ? e.message : 'Could not load subnet detail',
      });
    }
  },

  validateInput: (payload) => api.validateRecord(payload),

  search: async (query: string) => {
    set({ searchLoading: true });
    try {
      const searchResult = await api.searchIp(query);
      set({ searchResult, searchLoading: false });
    } catch (e) {
      set({
        searchLoading: false,
        error: e instanceof Error ? e.message : 'Search failed',
      });
    }
  },

  addRecord: async (payload) => {
    const { record } = await api.createRecord(payload);
    await get().loadRecords();
    await get().loadDashboard();
    await get().loadAnalytics();
    const openSubnetId = get().subnetDetail?.subnet.id;
    if (openSubnetId) {
      await get().loadSubnetDetail(openSubnetId);
    }
    return record;
  },

  editRecord: async (id, payload) => {
    const { record } = await api.updateRecord(id, payload);
    await get().loadRecords();
    await get().loadDashboard();
    if (get().subnetDetail?.subnet.id === id) {
      await get().loadSubnetDetail(id);
    }
    return record;
  },

  removeRecord: async (id, opts) => {
    await api.deleteRecord(id, opts);
    await get().loadRecords();
    await get().loadDashboard();
    if (get().subnetDetail?.subnet.id === id) {
      set({ subnetDetail: null });
    } else if (get().subnetDetail) {
      await get().loadSubnetDetail(get().subnetDetail!.subnet.id);
    }
  },

  importVlsm: async (plan, project) => {
    const result = await api.importVlsmPlan(plan, project);
    await get().loadRecords();
    await get().loadDashboard();
    await get().loadAnalytics();
    return { created: result.created.length, errors: result.errors, createdList: result.created };
  },

  bulkImportCsv: async (csv) => {
    const result = await api.bulkImportCsv(csv);
    await get().loadRecords();
    await get().loadDashboard();
    await get().loadAnalytics();
    return result;
  },

  clearSearch: () => set({ searchResult: null }),
  clearSubnetDetail: () => set({ subnetDetail: null, subnetDetailError: null }),

  openWorkflowTabRequest: 0,
  requestWorkflowTab: () => set((s) => ({ openWorkflowTabRequest: s.openWorkflowTabRequest + 1 })),
}));
