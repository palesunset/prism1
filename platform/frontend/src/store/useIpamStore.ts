import { create } from 'zustand';
import type {
  IpamAnalytics,
  IpamAuditEntry,
  IpamConflictScan,
  IpamIntegrityAudit,
  IpamRecord,
  IpamSearchResult,
  IpamSubnetDetail,
  IpamValidateResult,
  SubnetDashboard,
} from '../services/ipamApi';
import * as api from '../services/ipamApi';

type IpamState = {
  records: IpamRecord[];
  dashboard: SubnetDashboard[];
  analytics: IpamAnalytics | null;
  integrityAudit: IpamIntegrityAudit | null;
  conflictScan: IpamConflictScan | null;
  subnetDetail: IpamSubnetDetail | null;
  auditLog: IpamAuditEntry[];
  loading: boolean;
  error: string | null;
  searchResult: IpamSearchResult | null;
  searchLoading: boolean;
  loadAll: () => Promise<void>;
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
  removeRecord: (id: string) => Promise<void>;
  importVlsm: (plan: unknown, project?: string) => Promise<{ created: number; errors: number }>;
  bulkImportCsv: (csv: string) => Promise<{ created: number; errors: number }>;
  clearSearch: () => void;
  clearSubnetDetail: () => void;
  openWorkflowTabRequest: number;
  requestWorkflowTab: () => void;
};

export const useIpamStore = create<IpamState>((set, get) => ({
  records: [],
  dashboard: [],
  analytics: null,
  integrityAudit: null,
  conflictScan: null,
  subnetDetail: null,
  auditLog: [],
  loading: false,
  error: null,
  searchResult: null,
  searchLoading: false,

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [records, dashboard, analytics, integrityAudit] = await Promise.all([
        api.fetchRecords(),
        api.fetchDashboard(),
        api.fetchAnalytics(),
        api.fetchIntegrityAudit(),
      ]);
      set({ records, dashboard, analytics, integrityAudit, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Could not load IPAM. Is the IPAM API running on port 3003?',
      });
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
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Analytics load failed' });
    }
  },

  loadIntegrity: async () => {
    try {
      const integrityAudit = await api.fetchIntegrityAudit();
      set({ integrityAudit });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Integrity audit failed' });
    }
  },

  loadAudit: async () => {
    try {
      const auditLog = await api.fetchAudit(150);
      set({ auditLog });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Audit log load failed' });
    }
  },

  scanConflicts: async () => {
    const conflictScan = await api.scanConflicts();
    set({ conflictScan });
    return conflictScan;
  },

  loadSubnetDetail: async (id) => {
    try {
      const subnetDetail = await api.fetchSubnetDetail(id);
      set({ subnetDetail });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Subnet detail failed';
      set({ subnetDetail: null });
      // Stale selection after delete/type change — handled in UI; don't block the whole page.
      if (!msg.toLowerCase().includes('subnet not found')) {
        set({ error: msg });
      }
    }
  },

  validateInput: async (payload) => api.validateRecord(payload),

  search: async (query) => {
    if (!query.trim()) {
      set({ searchResult: null });
      return;
    }
    set({ searchLoading: true });
    try {
      const searchResult = await api.searchIp(query);
      set({ searchResult, searchLoading: false, error: null });
    } catch (e) {
      set({
        searchLoading: false,
        searchResult: null,
        error: e instanceof Error ? e.message : 'Search failed',
      });
    }
  },

  addRecord: async (payload) => {
    try {
      const { record } = await api.createRecord(payload);
      await get().loadAll();
      const selectedId = get().subnetDetail?.subnet.id;
      if (selectedId) {
        await get().loadSubnetDetail(selectedId);
      }
      return record;
    } catch (e) {
      throw e instanceof Error ? e : new Error('Could not save record');
    }
  },

  editRecord: async (id, payload) => {
    const { record } = await api.updateRecord(id, payload);
    await get().loadAll();
    return record;
  },

  removeRecord: async (id) => {
    await api.deleteRecord(id);
    set((s) => ({
      records: s.records.filter((r) => r.id !== id),
      subnetDetail: s.subnetDetail?.subnet.id === id ? null : s.subnetDetail,
      error: s.subnetDetail?.subnet.id === id && s.error === 'Subnet not found' ? null : s.error,
    }));
    await get().loadDashboard();
    await get().loadAnalytics();
  },

  importVlsm: async (plan, project) => {
    const result = await api.importVlsmPlan(plan, project);
    await get().loadAll();
    set({ conflictScan: null, subnetDetail: null });
    return { created: result.created.length, errors: result.errors.length };
  },

  bulkImportCsv: async (csv) => {
    const result = await api.bulkImportCsv(csv);
    await get().loadAll();
    return { created: result.created.length, errors: result.errors.length };
  },

  clearSearch: () => set({ searchResult: null }),
  clearSubnetDetail: () => set({ subnetDetail: null }),
  openWorkflowTabRequest: 0,
  requestWorkflowTab: () => set((s) => ({ openWorkflowTabRequest: s.openWorkflowTabRequest + 1 })),
}));
