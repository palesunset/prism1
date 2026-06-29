import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/services/api';
import type { Site } from '@/types';

export type SitesListParams = api.FetchSitesParams;

export function useMapBootstrap() {
  return useQuery({
    queryKey: ['inventory-bootstrap'],
    queryFn: () => api.fetchInventoryBootstrap(),
    staleTime: 60_000,
  });
}

/** @deprecated string form — pass `{ q, vendor }` or `SitesListParams` */
export function useSitesList(q?: string | SitesListParams, vendor?: string) {
  const params: api.FetchSitesParams =
    typeof q === 'string' || q === undefined
      ? { q: typeof q === 'string' ? q : undefined, vendor: vendor || undefined }
      : { ...q, vendor: q.vendor ?? vendor };

  return useQuery({
    queryKey: ['sites', params.q ?? '', params.vendor ?? '', params.territory ?? '', params.region ?? ''],
    queryFn: () => api.fetchSites(params),
  });
}

export function useSiteTerritories() {
  return useQuery({
    queryKey: ['site-territories'],
    queryFn: () => api.fetchSiteTerritories(),
    staleTime: 60_000,
  });
}

export function useSiteRegions() {
  return useQuery({
    queryKey: ['site-regions'],
    queryFn: () => api.fetchSiteRegions(),
    staleTime: 60_000,
  });
}

export function useEquipmentVendors() {
  return useQuery({
    queryKey: ['equipment-vendors'],
    queryFn: () => api.fetchEquipmentVendors(),
  });
}

export function useSite(id: string | undefined, vendor?: string) {
  return useQuery({
    queryKey: ['site', id, vendor ?? ''],
    queryFn: () => api.fetchSite(id!, vendor),
    enabled: Boolean(id),
  });
}

export function useSiteMutations() {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body: Partial<Site>) => api.createSite(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-bootstrap'] });
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['site-territories'] });
      qc.invalidateQueries({ queryKey: ['site-regions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Site> }) =>
      api.updateSite(id, body),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['inventory-bootstrap'] });
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['site-territories'] });
      qc.invalidateQueries({ queryKey: ['site-regions'] });
      qc.invalidateQueries({ queryKey: ['site', v.id] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-bootstrap'] });
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['site-territories'] });
      qc.invalidateQueries({ queryKey: ['site-regions'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return { create, update, remove };
}

export function useSummary(q?: string, vendor?: string) {
  return useQuery({
    queryKey: ['summary', q ?? '', vendor ?? ''],
    queryFn: () => api.fetchSummary(q, vendor),
  });
}
