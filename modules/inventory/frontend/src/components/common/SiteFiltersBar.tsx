import clsx from 'clsx';
import { MultiSelectFilter } from '@/components/common/MultiSelectFilter';

const selectClass = 'input-field';

export type FilterOption = string | { value: string; label?: string };

function normalizeFilterOptions(options: FilterOption[]) {
  return options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value }
  );
}

type Props = {
  regions: FilterOption[];
  areas: FilterOption[];
  region?: string;
  area?: string;
  onRegionChange?: (v: string) => void;
  onAreaChange?: (v: string) => void;
  /** Map-only: multi-select region filter */
  regionMulti?: string[];
  onRegionMultiChange?: (v: string[]) => void;
  /** Map-only: multi-select area filter */
  areaMulti?: string[];
  onAreaMultiChange?: (v: string[]) => void;
  routerTypes?: string[];
  routerType?: string;
  onRouterTypeChange?: (v: string) => void;
  /** Map-only: multi-select router type filter */
  routerTypeMulti?: string[];
  onRouterTypeMultiChange?: (v: string[]) => void;
  /** When set, equipment counts and port utilization use only this vendor */
  vendors?: string[];
  vendor?: string;
  onVendorChange?: (v: string) => void;
  /** Map only: hide sites without lat/lng */
  coordsOnly?: boolean;
  onCoordsOnlyChange?: (v: boolean) => void;
  /** Sites page: show Territory column before Region */
  filtersOrder?: 'region-first' | 'territory-first';
  className?: string;
};

export function SiteFiltersBar({
  regions,
  areas,
  region = '',
  area = '',
  onRegionChange,
  onAreaChange,
  regionMulti,
  onRegionMultiChange,
  areaMulti,
  onAreaMultiChange,
  routerTypes,
  routerType = '',
  onRouterTypeChange,
  routerTypeMulti,
  onRouterTypeMultiChange,
  vendors,
  vendor = '',
  onVendorChange,
  coordsOnly,
  onCoordsOnlyChange,
  filtersOrder = 'region-first',
  className,
}: Props) {
  const regionOpts = normalizeFilterOptions(regions);
  const areaOpts = normalizeFilterOptions(areas);

  const regionBlock =
    onRegionMultiChange != null && regionMulti != null ? (
      <MultiSelectFilter
        label="Region"
        options={regionOpts}
        value={regionMulti}
        onChange={onRegionMultiChange}
        placeholder="All regions"
      />
    ) : (
      <div className="min-w-[140px] flex-1">
        <label htmlFor="filter-region" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Region
        </label>
        <select
          id="filter-region"
          className={clsx('w-full', selectClass)}
          value={region}
          onChange={(e) => onRegionChange?.(e.target.value)}
        >
          <option value="">All regions</option>
          {regionOpts.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    );

  const territoryBlock =
    onAreaMultiChange != null && areaMulti != null ? (
      <MultiSelectFilter
        label="Territory"
        options={areaOpts}
        value={areaMulti}
        onChange={onAreaMultiChange}
        placeholder="All territories"
      />
    ) : (
      <div className="min-w-[140px] flex-1">
        <label htmlFor="filter-territory" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Territory
        </label>
        <select
          id="filter-territory"
          className={clsx('w-full', selectClass)}
          value={area}
          onChange={(e) => onAreaChange?.(e.target.value)}
        >
          <option value="">All territories</option>
          {areaOpts.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
    );

  return (
    <div
      className={clsx(
        'flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40',
        className
      )}
    >
      {filtersOrder === 'territory-first' ? (
        <>
          {territoryBlock}
          {regionBlock}
        </>
      ) : (
        <>
          {regionBlock}
          {territoryBlock}
        </>
      )}
      {routerTypes != null &&
        (onRouterTypeMultiChange != null && routerTypeMulti != null ? (
          <MultiSelectFilter
            label="Router Type"
            options={routerTypes}
            value={routerTypeMulti}
            onChange={onRouterTypeMultiChange}
            placeholder="All router types"
          />
        ) : onRouterTypeChange != null ? (
          <div className="min-w-[160px] flex-1">
            <label
              htmlFor="filter-router-type"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Router Type
            </label>
            <select
              id="filter-router-type"
              className={clsx('w-full', selectClass)}
              value={routerType}
              onChange={(e) => onRouterTypeChange(e.target.value)}
            >
              <option value="">All router types</option>
              {routerTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        ) : null)}
      {onVendorChange != null && vendors != null && (
        <div className="min-w-[160px] flex-1">
          <label
            htmlFor="filter-vendor"
            className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            Vendor
          </label>
          <select
            id="filter-vendor"
            className={clsx('w-full', selectClass)}
            value={vendor}
            onChange={(e) => onVendorChange(e.target.value)}
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      )}
      {onCoordsOnlyChange != null && (
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="rounded border-slate-400"
            checked={Boolean(coordsOnly)}
            onChange={(e) => onCoordsOnlyChange(e.target.checked)}
          />
          Only sites with map coordinates
        </label>
      )}
    </div>
  );
}
