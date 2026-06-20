import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Site } from '@/types';
import { routerTypeForMapPin } from '@/utils/siteFilters';
import { useMapFilterStore } from '@/store/mapFilterStore';
import { latLngPointsFromSites, sitesWithCoordinates } from '@/utils/mapBounds';
import { SiteMapPopupContent, SiteMapTooltipContent } from '@/components/Map/SiteMapPopup';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Stable hue for any router type string (used when not in the known palette). */
function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = str.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

function routerTypeColor(routerType: string | null | undefined): string {
  const t = (routerType || '').trim();
  if (!t) return '#64748b';

  switch (t) {
    case 'P':
      return '#7c3aed';
    case 'DR':
      return '#16a34a';
    case 'BR':
      return '#dc2626';
    case 'PEe':
      return '#f97316';
    case 'PEc':
      return '#eab308';
    case 'FMAGG':
      return '#8b5a2b';
    case 'AGG':
      return '#2563eb';
    case 'AG':
      return '#6b7280';
    case 'RR':
      return '#0d9488';
    default:
      return `hsl(${hashHue(t)}, 68%, 46%)`;
  }
}

function markerIconForRouterType(routerType: string | null | undefined): L.DivIcon {
  const fill = routerTypeColor(routerType);
  const html = `
    <div style="position:relative; width:26px; height:40px;">
      <svg width="26" height="40" viewBox="0 0 26 40" xmlns="http://www.w3.org/2000/svg" style="display:block">
        <path d="M13 0C6.4 0 1 5.4 1 12c0 10 12 28 12 28s12-18 12-28C25 5.4 19.6 0 13 0z" fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
        <circle cx="13" cy="12" r="5" fill="white" fill-opacity="0.95"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    className: 'router-type-marker',
    html,
    iconSize: [26, 40],
    iconAnchor: [13, 40],
    popupAnchor: [0, -34],
  });
}

function MapClickHandler({
  onMapClick,
  enabled,
}: {
  onMapClick: (lat: number, lng: number) => void;
  enabled: boolean;
}) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapMovePersistence() {
  const setMapView = useMapFilterStore((s) => s.setMapView);
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter();
      setMapView([c.lat, c.lng], map.getZoom());
    },
    zoomend() {
      const c = map.getCenter();
      setMapView([c.lat, c.lng], map.getZoom());
    },
  });
  return null;
}

function FitMapToSites({
  sites,
  active,
}: {
  sites: (Site & { lat: number; lng: number })[];
  active: boolean;
}) {
  const map = useMap();
  const lastFitKey = useRef('');

  useEffect(() => {
    if (!active || sites.length === 0) return;

    const key = sites
      .map((s) => s.id)
      .sort()
      .join(',');
    if (key === lastFitKey.current) return;
    lastFitKey.current = key;

    const points = latLngPointsFromSites(sites);
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }

    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 12 });
  }, [active, sites, map]);

  return null;
}

function SiteMarkers({
  sites,
  routerTypeFilter,
  onMarkerClick,
}: {
  sites: (Site & { lat: number; lng: number })[];
  routerTypeFilter: string[];
  onMarkerClick?: (siteId: string) => void;
}) {
  const iconCache = useMemo(() => new Map<string, L.DivIcon>(), []);
  return (
    <>
      {sites.map((s) => {
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={(() => {
              const rt = routerTypeForMapPin(s, routerTypeFilter);
              const key = `${rt ?? '__none__'}|${routerTypeFilter.join(',')}`;
              const cached = iconCache.get(key);
              if (cached) return cached;
              const next = markerIconForRouterType(rt);
              iconCache.set(key, next);
              return next;
            })()}
          >
            <Tooltip direction="top" offset={[0, -36]} className="site-map-tooltip-wrapper">
              <SiteMapTooltipContent site={s} />
            </Tooltip>
            <Popup className="site-map-popup" maxWidth={340} minWidth={260}>
              <SiteMapPopupContent
                site={s}
                onViewDetails={onMarkerClick ? () => onMarkerClick(s.id) : undefined}
              />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export function SiteMap({
  sites,
  routerTypeFilter = [],
  pickMode,
  onPickLatLng,
  heightClass = 'h-[70vh]',
  onMarkerClick,
  autoFitToSites = false,
}: {
  sites: Site[];
  routerTypeFilter?: string[];
  pickMode?: boolean;
  onPickLatLng?: (lat: number, lng: number) => void;
  heightClass?: string;
  onMarkerClick?: (siteId: string) => void;
  /** When true, zoom/pan to include all sites that have coordinates. */
  autoFitToSites?: boolean;
}) {
  const mapCenter = useMapFilterStore((s) => s.mapCenter);
  const mapZoom = useMapFilterStore((s) => s.mapZoom);

  const withCoords = useMemo(() => sitesWithCoordinates(sites), [sites]);

  useEffect(() => {
    if (pickMode) document.body.style.cursor = 'crosshair';
    else document.body.style.cursor = '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [pickMode]);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 ${heightClass}`}>
      <MapContainer center={mapCenter} zoom={mapZoom} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapMovePersistence />
        {autoFitToSites && <FitMapToSites sites={withCoords} active={autoFitToSites} />}
        {pickMode && onPickLatLng && <MapClickHandler enabled={pickMode} onMapClick={onPickLatLng} />}
        <SiteMarkers sites={withCoords} routerTypeFilter={routerTypeFilter} onMarkerClick={onMarkerClick} />
      </MapContainer>
    </div>
  );
}
