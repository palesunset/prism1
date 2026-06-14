import axios from 'axios';
import type { DashboardBundle, DashboardFilters } from '@/types/dashboard';
import { authHeaderRecord, clearStoredApiKey } from '@/services/apiAuth';
import { inventoryApiBase } from '@/services/inventoryApiBase';

const client = axios.create({
  baseURL: inventoryApiBase(),
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const auth = authHeaderRecord();
  if (auth.Authorization) {
    config.headers.Authorization = auth.Authorization;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredApiKey();
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

function toParams(f: DashboardFilters, extra?: Record<string, string | undefined>) {
  const p: Record<string, string> = {};
  if (f.areas?.length) p.areas = f.areas.join(',');
  if (f.regions?.length) p.regions = f.regions.join(',');
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.siteIds?.length) p.site_ids = f.siteIds.join(',');
  if (f.vendors?.length) p.vendors = f.vendors.join(',');
  if (f.routerTypes?.length) p.router_types = f.routerTypes.join(',');
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) p[k] = v;
    }
  }
  return p;
}

export async function fetchDashboardBundle(
  f: DashboardFilters,
  opts?: { siteUtilSort?: string }
): Promise<DashboardBundle> {
  const base = toParams(f);
  const sort = opts?.siteUtilSort || 'util_desc';
  const paramsUtil = { ...base, sort };
  const [
    { data: kpis },
    { data: vendorDistribution },
    { data: statusDistribution },
    { data: siteUtilization },
    { data: areaRegion },
    { data: eolTimeline },
    { data: topSites },
    { data: recentActivity },
    { data: sitesOverview },
  ] = await Promise.all([
    client.get('/dashboard/kpis', { params: base }),
    client.get('/dashboard/vendor-distribution', { params: base }),
    client.get('/dashboard/status-distribution', { params: base }),
    client.get('/dashboard/site-utilization', { params: paramsUtil }),
    client.get('/dashboard/area-region-breakdown', { params: base }),
    client.get('/dashboard/eol-timeline', { params: base }),
    client.get('/dashboard/top-sites', { params: base }),
    client.get('/dashboard/recent-activity', { params: base }),
    client.get('/dashboard/sites-overview', { params: base }),
  ]);
  return {
    kpis,
    vendorDistribution,
    statusDistribution,
    siteUtilization,
    areaRegion,
    eolTimeline,
    topSites,
    recentActivity,
    sitesOverview,
  };
}
