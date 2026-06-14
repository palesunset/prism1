import { useEffect, useMemo, useState } from 'react';
import { Download, FileDown, PieChart as PieIcon, Disc } from 'lucide-react';
import { useSitesList, useEquipmentVendors } from '@/hooks/useSites';
import { useDashboardData, useInvalidateDashboard } from '@/hooks/useDashboardData';
import type { DashboardFilters as DashboardFilterValues } from '@/types/dashboard';
import type { SiteSummaryRow } from '@/types';
import { downloadGlobalExportCsv } from '@/services/api';
import { generateDashboardPdf } from '@/utils/pdfGenerator';
import { FullPDFReportButton } from '@/components/Reports/PDFReportButton';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ScrollRegion } from '@/components/common/ScrollRegion';
import {
  parseSiteRouterTypes,
  sitesForAreaFacetOptions,
  sitesForRegionFacetOptions,
  sitesForRouterTypeFacetOptions,
  uniqueSortedStrings,
} from '@/utils/siteFilters';
import {
  CollapsibleChartCard,
  KPISection,
  VendorDonutChart,
  StatusBarChart,
  SiteUtilizationChart,
  AreaBreakdownChart,
  EOLTimelineChart,
  TopSitesChart,
  SitesOverviewTable,
  DashboardFilters,
} from '@/components/Dashboard';

function SkeletonCard() {
  return (
    <div className="kpi-card min-h-[6.75rem] animate-pulse border-transparent bg-slate-200/80 dark:bg-slate-800/80 sm:min-h-[7.25rem]" />
  );
}

function SkeletonChart() {
  return <div className="h-[300px] animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800/80" />;
}

export function DashboardPage() {
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [areaFilter, setAreaFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [routerTypeFilter, setRouterTypeFilter] = useState<string[]>([]);
  const [siteUtilSort, setSiteUtilSort] = useState('util_desc');
  const [vendorMode, setVendorMode] = useState<'donut' | 'pie'>('donut');

  const apiFilters: DashboardFilterValues = useMemo(
    () => ({
      regions: regionFilter.length ? regionFilter : undefined,
      areas: areaFilter.length ? areaFilter : undefined,
      vendors: vendorFilter.length ? vendorFilter : undefined,
      routerTypes: routerTypeFilter.length ? routerTypeFilter : undefined,
    }),
    [areaFilter, regionFilter, vendorFilter, routerTypeFilter]
  );

  const { data: allSites = [] } = useSitesList();
  const { data: vendorList = [] } = useEquipmentVendors();
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useDashboardData(apiFilters, siteUtilSort);
  const invalidateDashboard = useInvalidateDashboard();

  const areas = useMemo(
    () =>
      uniqueSortedStrings(
        sitesForAreaFacetOptions(allSites, {
          regions: regionFilter,
          routerTypes: routerTypeFilter,
        }).map((s) => s.area)
      ),
    [allSites, regionFilter, routerTypeFilter]
  );
  const regions = useMemo(
    () =>
      uniqueSortedStrings(
        sitesForRegionFacetOptions(allSites, {
          areas: areaFilter,
          routerTypes: routerTypeFilter,
        }).map((s) => s.region)
      ),
    [allSites, areaFilter, routerTypeFilter]
  );

  const routerTypes = useMemo(
    () =>
      uniqueSortedStrings(
        sitesForRouterTypeFacetOptions(allSites, {
          areas: areaFilter,
          regions: regionFilter,
        }).flatMap((s) => parseSiteRouterTypes(s))
      ),
    [allSites, areaFilter, regionFilter]
  );

  useEffect(() => {
    setRegionFilter((prev) => {
      const next = prev.filter((r) => regions.includes(r));
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [regions]);

  useEffect(() => {
    setAreaFilter((prev) => {
      const next = prev.filter((a) => areas.includes(a));
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [areas]);

  useEffect(() => {
    const allowed = new Set(routerTypes);
    const next = routerTypeFilter.filter((t) => allowed.has(t));
    if (next.length !== routerTypeFilter.length) {
      setRouterTypeFilter(next);
    }
  }, [routerTypes, routerTypeFilter]);

  useEffect(() => {
    if (!vendorList.length) return;
    setVendorFilter((prev) => {
      const allowed = new Set(vendorList);
      const next = prev.filter((v) => allowed.has(v));
      if (next.length === prev.length && next.every((x, i) => x === prev[i])) return prev;
      return next;
    });
  }, [vendorList]);

  const summaryRowsForPdf: SiteSummaryRow[] = useMemo(() => {
    if (!data) return [];
    return data.sitesOverview.sites.map((s) => ({
      id: s.id,
      name: s.name,
      plaid: s.plaid,
      area: s.area,
      region: s.region,
      address: s.address,
      equipment_count: s.equipment_count,
      total_ports: s.total_ports,
      utilized_ports: s.utilized_ports,
      utilization_pct: s.utilization_pct,
    }));
  }, [data]);

  const filterNote = [
    apiFilters.regions?.length ? `Region: ${apiFilters.regions.join(', ')}` : '',
    apiFilters.areas?.length ? `Territory: ${apiFilters.areas.join(', ')}` : '',
    apiFilters.vendors?.length ? `Vendor: ${apiFilters.vendors.join(', ')}` : '',
    apiFilters.routerTypes?.length ? `Router Types: ${apiFilters.routerTypes.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const busy = isLoading || isFetching;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollRegion>
      <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Network Inventory Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Last updated: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void downloadGlobalExportCsv().catch(() => undefined);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          >
            <Download className="h-4 w-4" />
            Export all CSV
          </button>
          <button
            type="button"
            disabled={!data}
            onClick={() => data && generateDashboardPdf(data, filterNote)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4" />
            Export dashboard PDF
          </button>
          <FullPDFReportButton summaryRows={summaryRowsForPdf} vendors={vendorFilter.length ? vendorFilter : undefined} />
        </div>
      </div>

      <DashboardFilters
        areas={areas}
        regions={regions}
        vendors={vendorList}
        routerTypes={routerTypes}
        selectedAreas={areaFilter}
        selectedRegions={regionFilter}
        selectedVendors={vendorFilter}
        selectedRouterTypes={routerTypeFilter}
        onRegionsChange={setRegionFilter}
        onAreasChange={setAreaFilter}
        onVendorsChange={setVendorFilter}
        onRouterTypesChange={setRouterTypeFilter}
        onRefresh={() => {
          invalidateDashboard();
          void refetch();
        }}
        isRefreshing={busy}
      />

      {isLoading && !data ? (
        <div className="kpi-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data ? (
        <KPISection data={data.kpis} />
      ) : null}

      {isLoading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <CollapsibleChartCard
              title="Equipment by vendor"
              actions={
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="Donut"
                    onClick={() => setVendorMode('donut')}
                    className={`rounded p-1.5 ${vendorMode === 'donut' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200' : 'text-slate-500'}`}
                  >
                    <Disc className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Pie"
                    onClick={() => setVendorMode('pie')}
                    className={`rounded p-1.5 ${vendorMode === 'pie' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200' : 'text-slate-500'}`}
                  >
                    <PieIcon className="h-4 w-4" />
                  </button>
                </div>
              }
            >
              <VendorDonutChart vendors={data.vendorDistribution.vendors} donut={vendorMode === 'donut'} />
            </CollapsibleChartCard>

            <CollapsibleChartCard title="Equipment by status">
              <StatusBarChart statuses={data.statusDistribution.statuses} />
            </CollapsibleChartCard>
          </div>

          <CollapsibleChartCard
            title="Port utilization by site"
            actions={
              <select
                value={siteUtilSort}
                onChange={(e) => setSiteUtilSort(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="util_desc">Utilization (high → low)</option>
                <option value="util_asc">Utilization (low → high)</option>
                <option value="name">Site name (A–Z)</option>
              </select>
            }
          >
            <SiteUtilizationChart sites={data.siteUtilization.sites} />
          </CollapsibleChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <CollapsibleChartCard title="Equipment by territory / region">
              <AreaBreakdownChart byArea={data.areaRegion.byArea} treemap={data.areaRegion.treemap} />
            </CollapsibleChartCard>
            <CollapsibleChartCard title="End of life (next 12 months)">
              <EOLTimelineChart points={data.eolTimeline.points} />
            </CollapsibleChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CollapsibleChartCard title="Top 5 sites by equipment">
              <TopSitesChart sites={data.topSites.sites} />
            </CollapsibleChartCard>
            <CollapsibleChartCard title="Recent activity">
              {data.recentActivity.events.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No recent changes recorded.</p>
              ) : (
                <ul className="max-h-[280px] space-y-2 overflow-y-auto text-sm">
                  {data.recentActivity.events.map((e) => (
                    <li
                      key={`${e.kind}-${e.refId}-${e.at}`}
                      className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                    >
                      <div className="text-xs text-slate-500 dark:text-slate-400">{e.at}</div>
                      <div className="font-medium text-slate-800 dark:text-slate-100">{e.siteName}</div>
                      <div className="text-slate-600 dark:text-slate-300">{e.description}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleChartCard>
          </div>

          <CollapsibleChartCard title="Sites overview" defaultOpen>
            {busy ? (
              <div className="mb-3 flex justify-end">
                <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <LoadingSpinner />
                  Updating…
                </span>
              </div>
            ) : null}
            <SitesOverviewTable sites={data.sitesOverview.sites} search="" />
          </CollapsibleChartCard>
        </>
      ) : (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}
      </div>
      </ScrollRegion>
    </div>
  );
}
