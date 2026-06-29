import axios from 'axios';
import type {
  Site,
  SiteDetailResponse,
  SiteSummaryRow,
  Equipment,
  EquipmentDetailResponse,
  ImportResult,
  GlobalSummaryDashboardStats,
  EquipmentBay,
} from '@/types';
import { authHeaderRecord, clearStoredApiKey, downloadAuthenticatedCsv } from '@/services/apiAuth';
import { inventoryApiBase, inventoryApiUrl } from '@/services/inventoryApiBase';

const api = axios.create({
  baseURL: inventoryApiBase(),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    // Let the browser set multipart boundary (manual Content-Type breaks file uploads).
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }
  const auth = authHeaderRecord();
  if (auth.Authorization) {
    config.headers.Authorization = auth.Authorization;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredApiKey();
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export type FetchSitesParams = {
  q?: string;
  vendor?: string;
  territory?: string;
  region?: string;
};

export async function fetchSites(params?: FetchSitesParams): Promise<Site[]> {
  const p: Record<string, string> = {};
  if (params?.q) p.q = params.q;
  if (params?.vendor) p.vendor = params.vendor;
  if (params?.territory) p.territory = params.territory;
  if (params?.region) p.region = params.region;
  const { data } = await api.get<Site[]>('/sites', {
    params: Object.keys(p).length ? p : undefined,
  });
  return data;
}

export async function fetchSiteTerritories(): Promise<string[]> {
  const { data } = await api.get<string[]>('/sites/territories');
  return data;
}

export async function fetchSiteRegions(): Promise<string[]> {
  const { data } = await api.get<string[]>('/sites/regions');
  return data;
}

export async function fetchEquipmentVendors(): Promise<string[]> {
  const { data } = await api.get<string[]>('/equipment/vendors');
  return data;
}

export async function fetchSite(id: string, vendor?: string): Promise<SiteDetailResponse> {
  const params = vendor ? { vendor } : undefined;
  const { data } = await api.get<SiteDetailResponse>(`/sites/${id}`, { params });
  return data;
}

export async function createSite(body: Partial<Site>): Promise<Site> {
  const { data } = await api.post<Site>('/sites', body);
  return data;
}

export async function updateSite(id: string, body: Partial<Site>): Promise<Site> {
  const { data } = await api.patch<Site>(`/sites/${id}`, body);
  return data;
}

export async function deleteSite(id: string): Promise<void> {
  await api.delete(`/sites/${id}`);
}

export async function fetchSummary(q?: string, vendor?: string): Promise<SiteSummaryRow[]> {
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (vendor) params.vendor = vendor;
  const { data } = await api.get<SiteSummaryRow[]>('/sites/summary', {
    params: Object.keys(params).length ? params : undefined,
  });
  return data;
}

export async function createEquipment(body: {
  site_id: string;
  vendor: string;
  network_element?: string;
  model: string;
  serial_number: string;
  router_type?: string | null;
  ip_address?: string | null;
  software_version?: string | null;
  descriptor_version?: string | null;
  end_of_life?: string | null;
  status?: string;
  rack_position?: string | null;
  chassis_slot_count?: number | null;
}): Promise<Equipment> {
  const { data } = await api.post<Equipment>('/equipment', body);
  return data;
}

export async function updateEquipment(
  id: string,
  body: Partial<{
    vendor: string;
    network_element: string | null;
    model: string;
    serial_number: string;
    router_type: string | null;
    ip_address: string | null;
    software_version: string | null;
    descriptor_version: string | null;
    end_of_life: string | null;
    status: string;
    rack_position: string | null;
    chassis_slot_count: number | null;
  }>
): Promise<Equipment> {
  const { data } = await api.patch<Equipment>(`/equipment/${id}`, body);
  return data;
}

export async function fetchEquipment(id: string): Promise<EquipmentDetailResponse> {
  const { data } = await api.get<EquipmentDetailResponse>(`/equipment/${id}`);
  return data;
}

export async function deleteEquipment(id: string): Promise<void> {
  await api.delete(`/equipment/${id}`);
}

export async function createSlot(body: {
  equipment_id: string;
  slot_name: string;
  total_ports: number;
}): Promise<{ slot: unknown; ports: unknown[] }> {
  const { data } = await api.post('/slots', body);
  return data;
}

export async function deleteSlot(id: string): Promise<void> {
  await api.delete(`/slots/${id}`);
}

export async function updatePort(
  id: string,
  body: { is_utilized?: boolean; description?: string }
): Promise<unknown> {
  const { data } = await api.patch(`/ports/${id}`, body);
  return data;
}

export async function importEquipmentCsv(siteId: string, file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('site_id', siteId);
  fd.append('file', file);
  const { data } = await api.post<ImportResult>('/equipment/import', fd);
  return data;
}

export async function importSitesCsv(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post<ImportResult>('/sites/import', fd);
  return data;
}

export async function importCombinedCsv(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post<ImportResult>('/sites/import/combined', fd);
  return data;
}

export function siteExportUrl(siteId: string, vendor?: string): string {
  const v = (vendor || '').toString().trim();
  const qs = v ? `?vendor=${encodeURIComponent(v)}` : '';
  return inventoryApiUrl(`/sites/${siteId}/export${qs}`);
}

export async function downloadSiteExportCsv(siteId: string, vendor?: string, filename?: string) {
  const url = siteExportUrl(siteId, vendor);
  await downloadAuthenticatedCsv(url, filename || `site-${siteId}-equipment.csv`);
}

export function globalExportUrl(): string {
  return inventoryApiUrl('/export/equipment');
}

export async function downloadGlobalExportCsv(filename = 'all-equipment-export.csv') {
  await downloadAuthenticatedCsv(globalExportUrl(), filename);
}

export async function fetchSummaryDashboardStats(siteIds: string[]): Promise<GlobalSummaryDashboardStats> {
  const params = { site_ids: siteIds.join(',') };
  const { data } = await api.get<GlobalSummaryDashboardStats>('/stats', { params });
  return data;
}

export async function fetchEquipmentBays(equipmentId: string): Promise<{
  equipment_id: string;
  bays: EquipmentBay[];
  summary: { total: number; utilized: number; free: number };
}> {
  const { data } = await api.get(`/equipment/${equipmentId}/bays`);
  return data;
}

export async function resizeEquipmentBays(
  equipmentId: string,
  total_slots: number
): Promise<{
  equipment_id: string;
  bays: EquipmentBay[];
  summary: { total: number; utilized: number; free: number };
}> {
  const { data } = await api.patch(`/equipment/${equipmentId}/bays/resize`, { total_slots });
  return data;
}

export async function updateEquipmentBay(
  bayId: string,
  body: Partial<{ is_utilized: boolean; label: string }>
): Promise<EquipmentBay> {
  const { data } = await api.patch<EquipmentBay>(`/equipment-bays/${bayId}`, body);
  return data;
}

