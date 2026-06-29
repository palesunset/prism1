import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useSitesList, useSiteMutations, useMapBootstrap } from '@/hooks/useSites';
import { useToast } from '@/hooks/useToast';
import { SiteMap } from '@/components/Map/SiteMap';
import { Modal } from '@/components/common/Modal';
import { SiteForm } from '@/components/Sites/SiteForm';
import { SiteFiltersBar } from '@/components/common/SiteFiltersBar';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ImportSitesCSV } from '@/components/Sites/ImportSitesCSV';
import type { Site } from '@/types';
import {
  matchesSiteCoordsFilter,
  parseSiteRouterTypes,
  siteMatchesRouterTypesMulti,
  siteTerritoryLabel,
  uniqueSortedStrings,
  regionFilterOptions,
  territoryFilterOptions,
} from '@/utils/siteFilters';
import { useMapFilterStore, DEFAULT_CENTER, DEFAULT_ZOOM } from '@/store/mapFilterStore';
import { invPath, useInventoryRoot } from '@/utils/inventoryPaths';
import { isDefaultMapView } from '@/utils/mapBounds';

function filterArraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function MapPage() {
  const navigate = useNavigate();
  const root = useInventoryRoot();
  const qc = useQueryClient();
  const { data: bootstrap, isLoading, isError, error, refetch } = useMapBootstrap();
  const sites = bootstrap?.sites ?? [];
  const territoryList = bootstrap?.territories ?? [];
  const regionList = bootstrap?.regions ?? [];
  const { create } = useSiteMutations();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [draft, setDraft] = useState<Partial<Site> | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  const {
    mapRegionFilter,
    mapTerritoryFilter,
    mapRouterTypeFilter,
    mapCoordsOnly,
    setMapRegionFilter,
    setMapTerritoryFilter,
    setMapRouterTypeFilter,
    setMapCoordsOnly,
    mapCenter,
    mapZoom,
  } = useMapFilterStore(
    useShallow((s) => ({
      mapRegionFilter: s.mapRegionFilter,
      mapTerritoryFilter: s.mapTerritoryFilter,
      mapRouterTypeFilter: s.mapRouterTypeFilter,
      mapCoordsOnly: s.mapCoordsOnly,
      setMapRegionFilter: s.setMapRegionFilter,
      setMapTerritoryFilter: s.setMapTerritoryFilter,
      setMapRouterTypeFilter: s.setMapRouterTypeFilter,
      setMapCoordsOnly: s.setMapCoordsOnly,
      mapCenter: s.mapCenter,
      mapZoom: s.mapZoom,
    })),
  );

  const autoFitToSites = useMemo(
    () => isDefaultMapView(mapCenter, mapZoom, DEFAULT_CENTER, DEFAULT_ZOOM),
    [mapCenter, mapZoom]
  );

  /** Full territory/region lists from API — always include ITL / INTERNATIONAL (not cross-filtered). */
  const regionOptions = useMemo(() => regionFilterOptions(regionList), [regionList]);
  const territoryOptions = useMemo(() => territoryFilterOptions(territoryList), [territoryList]);

  const regions = useMemo(() => regionOptions.map((o) => o.value), [regionOptions]);
  const areas = useMemo(() => territoryOptions.map((o) => o.value), [territoryOptions]);

  const routerTypes = useMemo(() => {
    const subset = sites.filter(
      (s) =>
        (mapRegionFilter.length === 0 || mapRegionFilter.includes(s.region)) &&
        (mapTerritoryFilter.length === 0 || mapTerritoryFilter.includes(siteTerritoryLabel(s)))
    );
    return uniqueSortedStrings(subset.flatMap((s) => parseSiteRouterTypes(s)));
  }, [sites, mapRegionFilter, mapTerritoryFilter]);

  useEffect(() => {
    const prev = useMapFilterStore.getState().mapRegionFilter;
    const next = prev.filter((r) => regions.includes(r));
    if (filterArraysEqual(next, prev)) return;
    setMapRegionFilter(next);
  }, [regions, setMapRegionFilter]);

  useEffect(() => {
    const prev = useMapFilterStore.getState().mapTerritoryFilter;
    const next = prev.filter((a) => areas.includes(a));
    if (filterArraysEqual(next, prev)) return;
    setMapTerritoryFilter(next);
  }, [areas, setMapTerritoryFilter]);

  useEffect(() => {
    const prev = useMapFilterStore.getState().mapRouterTypeFilter;
    const next = prev.filter((t) => routerTypes.includes(t));
    if (filterArraysEqual(next, prev)) return;
    setMapRouterTypeFilter(next);
  }, [routerTypes, setMapRouterTypeFilter]);

  const mapSites = useMemo(
    () =>
      sites.filter(
        (s) =>
          (mapRegionFilter.length === 0 || mapRegionFilter.includes(s.region)) &&
          (mapTerritoryFilter.length === 0 || mapTerritoryFilter.includes(siteTerritoryLabel(s))) &&
          siteMatchesRouterTypesMulti(s, mapRouterTypeFilter) &&
          matchesSiteCoordsFilter(s, mapCoordsOnly)
      ),
    [sites, mapRegionFilter, mapTerritoryFilter, mapRouterTypeFilter, mapCoordsOnly]
  );

  async function submitSite(values: Partial<Site>) {
    try {
      await create.mutateAsync(values);
      showToast('Site created', 'success');
      setModalOpen(false);
      setPickMode(false);
      setDraft(null);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Failed to create site';
      showToast(msg || 'Failed to create site', 'error');
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Map</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Open a marker popup, then use “View details” to open a site. Use “Add site” to place a new site on the map.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft({});
              setFormKey((k) => k + 1);
              setPickMode(true);
              setModalOpen(true);
            }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Add site from map
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
          >
            Bulk upload sites
          </button>
        </div>
      </div>

      <div className="shrink-0">
      <SiteFiltersBar
        regions={regionOptions}
        areas={territoryOptions}
        regionMulti={mapRegionFilter}
        areaMulti={mapTerritoryFilter}
        onRegionMultiChange={setMapRegionFilter}
        onAreaMultiChange={setMapTerritoryFilter}
        routerTypes={routerTypes}
        routerTypeMulti={mapRouterTypeFilter}
        onRouterTypeMultiChange={setMapRouterTypeFilter}
        coordsOnly={mapCoordsOnly}
        onCoordsOnlyChange={setMapCoordsOnly}
      />
      </div>
      <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
        Pin color follows router type. With a router-type filter, each pin uses that type when the site has it;
        otherwise the first type listed for the site. Unknown types use a stable color from the name.
      </p>

      <div className="min-h-0 flex-1">
      {isError ? (
        <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-red-500">
            Could not load sites{error instanceof Error && error.message ? `: ${error.message}` : ''}.
          </p>
          <button type="button" className="btn-primary text-sm" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex h-full min-h-[12rem] items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <SiteMap
          sites={mapSites}
          routerTypeFilter={mapRouterTypeFilter}
          autoFitToSites={autoFitToSites}
          pickMode={pickMode && modalOpen}
          heightClass="h-full min-h-[12rem]"
          onPickLatLng={(lat, lng) => {
            setDraft((d) => ({ ...d, lat, lng }));
            showToast('Coordinates set from map click', 'success');
          }}
          onMarkerClick={(siteId) => navigate(invPath(root, 'sites', siteId))}
        />
      )}
      </div>

      <Modal
        open={modalOpen}
        title="New site"
        onClose={() => {
          setModalOpen(false);
          setPickMode(false);
          setDraft(null);
        }}
      >
        {pickMode && (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
            Click the map to set latitude and longitude, or type them below.
          </p>
        )}
        <SiteForm
          syncToken={formKey}
          initial={draft as Site | null}
          onSubmit={submitSite}
          onCancel={() => {
            setModalOpen(false);
            setPickMode(false);
            setDraft(null);
          }}
          submitLabel="Create site"
        />
      </Modal>

      <ImportSitesCSV
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ['inventory-bootstrap'] });
          qc.invalidateQueries({ queryKey: ['sites'] });
          qc.invalidateQueries({ queryKey: ['summary'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />
    </div>
  );
}
