import { RefreshCw } from 'lucide-react';
import { MultiSelectFilter } from '@/components/common/MultiSelectFilter';

export function DashboardFilters({
  areas,
  regions,
  vendors,
  routerTypes,
  selectedAreas,
  selectedRegions,
  selectedVendors,
  selectedRouterTypes,
  onAreasChange,
  onRegionsChange,
  onVendorsChange,
  onRouterTypesChange,
  onRefresh,
  isRefreshing,
}: {
  areas: string[];
  regions: string[];
  vendors: string[];
  routerTypes: string[];
  selectedAreas: string[];
  selectedRegions: string[];
  selectedVendors: string[];
  selectedRouterTypes: string[];
  onAreasChange: (v: string[]) => void;
  onRegionsChange: (v: string[]) => void;
  onVendorsChange: (v: string[]) => void;
  onRouterTypesChange: (v: string[]) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <MultiSelectFilter
            label="Region"
            options={regions}
            value={selectedRegions}
            onChange={onRegionsChange}
            placeholder="All regions"
          />
        </div>
        <div className="min-w-[160px]">
          <MultiSelectFilter
            label="Territory"
            options={areas}
            value={selectedAreas}
            onChange={onAreasChange}
            placeholder="All territories"
          />
        </div>
        <div className="min-w-[180px]">
          <MultiSelectFilter
            label="Router Type"
            options={routerTypes}
            value={selectedRouterTypes}
            onChange={onRouterTypesChange}
            placeholder="All router types"
          />
        </div>
        <div className="min-w-[180px]">
          <MultiSelectFilter
            label="Vendor"
            options={vendors}
            value={selectedVendors}
            onChange={onVendorsChange}
            placeholder="All vendors"
          />
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Region, territory, router type, and vendor apply to all KPIs and charts (vendor and router type limit
        equipment/port metrics). Each control only lists values that still exist given your other selections;
        incompatible choices are cleared when options change.
      </p>
    </div>
  );
}
