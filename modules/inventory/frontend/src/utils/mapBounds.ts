import type { Site } from '@/types';

export const LEGACY_DEFAULT_CENTER: [number, number] = [5, -150];
export const LEGACY_DEFAULT_ZOOM = 1;

/** Fallback map view when no sites have coordinates (Philippines-centered). */
export const FALLBACK_MAP_CENTER: [number, number] = [14, 121];
export const FALLBACK_MAP_ZOOM = 6;

export function sitesWithCoordinates(sites: Site[]): (Site & { lat: number; lng: number })[] {
  return sites.filter((s) => s.lat != null && s.lng != null) as (Site & { lat: number; lng: number })[];
}

export function isDefaultMapView(
  center: [number, number],
  zoom: number,
  defaultCenter: [number, number],
  defaultZoom: number
): boolean {
  const matches = (a: [number, number], b: [number, number], z1: number, z2: number) =>
    Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01 && z1 === z2;

  return (
    matches(center, defaultCenter, zoom, defaultZoom) ||
    matches(center, LEGACY_DEFAULT_CENTER, zoom, LEGACY_DEFAULT_ZOOM)
  );
}

export function latLngPointsFromSites(sites: (Site & { lat: number; lng: number })[]): [number, number][] {
  return sites.map((s) => [s.lat, s.lng]);
}
