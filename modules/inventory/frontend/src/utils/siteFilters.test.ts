import { describe, expect, it } from 'vitest';
import { siteMatchesRouterTypesMulti, parseSiteRouterTypes } from './siteFilters';
import type { Site } from '@/types';

describe('siteMatchesRouterTypesMulti', () => {
  const site = {
    equipment_router_types: 'P, DR',
  } as Pick<Site, 'equipment_router_types'>;

  it('matches when filter empty', () => {
    expect(siteMatchesRouterTypesMulti(site, [])).toBe(true);
  });

  it('matches any selected router type', () => {
    expect(siteMatchesRouterTypesMulti(site, ['DR'])).toBe(true);
    expect(siteMatchesRouterTypesMulti(site, ['AGG'])).toBe(false);
  });

  it('parses router types from aggregate field', () => {
    expect(parseSiteRouterTypes(site)).toEqual(['P', 'DR']);
  });
});
