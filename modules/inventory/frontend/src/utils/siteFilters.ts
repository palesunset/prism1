/** Client-side filters for site-like rows (Sites list, Map, Summary). */

import type { Site } from '@/types';

export type SiteFilterShape = {
  region: string;
  area: string;
  router_type?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function matchesSiteRegionArea(
  s: Pick<SiteFilterShape, 'region' | 'area'>,
  region: string,
  area: string
): boolean {
  if (region && s.region !== region) return false;
  if (area && s.area !== area) return false;
  return true;
}

export function matchesSiteRouterType(
  s: Pick<SiteFilterShape, 'router_type'>,
  routerType: string
): boolean {
  if (!routerType) return true;
  return (s.router_type || '') === routerType;
}

export function matchesSiteCoordsFilter(
  s: Pick<SiteFilterShape, 'lat' | 'lng'>,
  coordsOnly: boolean
): boolean {
  if (!coordsOnly) return true;
  return s.lat != null && s.lng != null;
}

/** Distinct router_type values present at the site (from API aggregate field). */
export function parseSiteRouterTypes(s: Pick<Site, 'equipment_router_types'>): string[] {
  return String(s.equipment_router_types || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * True if no router types are selected, or the site has at least one selected type on its equipment.
 * Matches dashboard “router types” semantics (OR across selected types).
 */
export function siteMatchesRouterTypesMulti(
  s: Pick<Site, 'equipment_router_types'>,
  selected: string[]
): boolean {
  if (!selected.length) return true;
  const set = new Set(parseSiteRouterTypes(s));
  return selected.some((t) => set.has(t));
}

export function uniqueSortedStrings(values: string[]): string[] {
  return [...new Set(values.filter((v) => v != null && String(v).trim() !== ''))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Territory facet order: numeric 1–9 first, then ITL, then others alphabetically. */
export function sortTerritoryFacetOptions(values: string[]): string[] {
  const uniq = uniqueSortedStrings(values);
  const numeric: string[] = [];
  const rest: string[] = [];
  for (const v of uniq) {
    if (/^\d+$/.test(v)) numeric.push(v);
    else rest.push(v);
  }
  numeric.sort((a, b) => Number(a) - Number(b));
  const itlIdx = rest.findIndex((v) => v.toUpperCase() === 'ITL');
  const itl = itlIdx >= 0 ? rest.splice(itlIdx, 1)[0] : null;
  rest.sort((a, b) => a.localeCompare(b));
  return [...numeric, ...(itl ? [itl] : []), ...rest];
}

/** User-facing label for region filter. */
export function regionFilterLabel(region: string): string {
  return region;
}

export function regionFilterOptions(regions: string[]): Array<{ value: string; label: string }> {
  return uniqueSortedStrings(regions).map((r) => ({ value: r, label: regionFilterLabel(r) }));
}

export function territoryFilterOptions(territories: string[]): Array<{ value: string; label: string }> {
  return sortTerritoryFacetOptions(territories).map((t) => ({
    value: t,
    label: t.toUpperCase() === 'ITL' ? 'ITL (International)' : t,
  }));
}

export function siteTerritoryLabel(s: Pick<Site, 'territory' | 'area'>): string {
  const t = (s.territory || '').toString().trim();
  return t || (s.area || '').toString().trim();
}

/** Sites to consider when listing Area options (respect selected regions + router types, not area). */
export function sitesForAreaFacetOptions(
  sites: Site[],
  ctx: { regions: string[]; routerTypes: string[] }
): Site[] {
  return sites.filter(
    (s) =>
      (ctx.regions.length === 0 || ctx.regions.includes(s.region)) &&
      siteMatchesRouterTypesMulti(s, ctx.routerTypes)
  );
}

/** Sites to consider when listing Region options (respect selected areas + router types, not region). */
export function sitesForRegionFacetOptions(
  sites: Site[],
  ctx: { areas: string[]; routerTypes: string[] }
): Site[] {
  return sites.filter(
    (s) =>
      (ctx.areas.length === 0 || ctx.areas.includes(siteTerritoryLabel(s))) &&
      siteMatchesRouterTypesMulti(s, ctx.routerTypes)
  );
}

/** Sites to consider when listing Router Type options (respect selected areas + regions, not router). */
export function sitesForRouterTypeFacetOptions(
  sites: Site[],
  ctx: { areas: string[]; regions: string[] }
): Site[] {
  return sites.filter(
    (s) =>
      (ctx.areas.length === 0 || ctx.areas.includes(siteTerritoryLabel(s))) &&
      (ctx.regions.length === 0 || ctx.regions.includes(s.region))
  );
}

/**
 * Router type to use for map pin color. When `preferredTypes` is non-empty (map filter), uses the first
 * preferred type that exists on the site so pins match the filter instead of always using the first
 * alphabetically listed type on the site (e.g. AGG before P).
 */
export function routerTypeForMapPin(
  site: Pick<Site, 'equipment_router_types'>,
  preferredTypes: string[]
): string | null {
  const types = parseSiteRouterTypes(site);
  if (!types.length) return null;
  if (preferredTypes.length) {
    const set = new Set(types);
    for (const p of preferredTypes) {
      if (set.has(p)) return p;
    }
  }
  return types[0];
}
