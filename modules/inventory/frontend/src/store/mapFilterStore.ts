import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FALLBACK_MAP_CENTER, FALLBACK_MAP_ZOOM } from '@/utils/mapBounds';

interface MapFilterState {
  searchTerm: string;
  territoryFilter: string;
  regionFilter: string;
  /** Map page: multi-select regions */
  mapRegionFilter: string[];
  /** Map page: multi-select territories (matches `Site.area` / territory label from API) */
  mapTerritoryFilter: string[];
  mapRouterTypeFilter: string[];
  mapCoordsOnly: boolean;
  mapCenter: [number, number];
  mapZoom: number;
  setSearchTerm: (term: string) => void;
  setTerritoryFilter: (territory: string) => void;
  setRegionFilter: (region: string) => void;
  setMapRegionFilter: (regions: string[]) => void;
  setMapTerritoryFilter: (territories: string[]) => void;
  setMapRouterTypeFilter: (types: string[]) => void;
  setMapCoordsOnly: (value: boolean) => void;
  setMapView: (center: [number, number], zoom: number) => void;
  resetFilters: () => void;
  resetMapView: () => void;
  resetAll: () => void;
}

/** Used when no site bounds are available yet. */
export const DEFAULT_CENTER: [number, number] = FALLBACK_MAP_CENTER;
export const DEFAULT_ZOOM = FALLBACK_MAP_ZOOM;

export const useMapFilterStore = create<MapFilterState>()(
  persist(
    (set) => ({
      searchTerm: '',
      territoryFilter: '',
      regionFilter: '',
      mapRegionFilter: [],
      mapTerritoryFilter: [],
      mapRouterTypeFilter: [],
      mapCoordsOnly: false,
      mapCenter: DEFAULT_CENTER,
      mapZoom: DEFAULT_ZOOM,

      setSearchTerm: (term) => set({ searchTerm: term }),
      setTerritoryFilter: (territory) => set({ territoryFilter: territory }),
      setRegionFilter: (region) => set({ regionFilter: region }),
      setMapRegionFilter: (regions) => set({ mapRegionFilter: regions }),
      setMapTerritoryFilter: (territories) => set({ mapTerritoryFilter: territories }),
      setMapRouterTypeFilter: (types) => set({ mapRouterTypeFilter: types }),
      setMapCoordsOnly: (value) => set({ mapCoordsOnly: value }),
      setMapView: (center, zoom) => set({ mapCenter: center, mapZoom: zoom }),

      resetFilters: () => set({ searchTerm: '', territoryFilter: '', regionFilter: '' }),
      resetMapView: () => set({ mapCenter: DEFAULT_CENTER, mapZoom: DEFAULT_ZOOM }),
      resetAll: () =>
        set({
          searchTerm: '',
          territoryFilter: '',
          regionFilter: '',
          mapRegionFilter: [],
          mapTerritoryFilter: [],
          mapRouterTypeFilter: [],
          mapCoordsOnly: false,
          mapCenter: DEFAULT_CENTER,
          mapZoom: DEFAULT_ZOOM,
        }),
    }),
    { name: 'dc-inventory-map-filter' }
  )
);
