import db from '../db/index.js';

function statsFromAggregateRow(row = {}) {
  const total = row.total_ports || 0;
  const used = row.utilized_ports || 0;
  const pct = total > 0 ? (used / total) * 100 : 0;
  const slotTotal = row.slot_count || 0;
  const slotUsed = row.utilized_slot_count || 0;
  const slotPct = slotTotal > 0 ? (slotUsed / slotTotal) * 100 : 0;
  return {
    equipment_count: row.equipment_count || 0,
    line_slot_count: row.line_slot_count || 0,
    slot_count: slotTotal,
    utilized_slot_count: slotUsed,
    free_slot_count: slotTotal - slotUsed,
    slot_utilization_pct: Math.round(slotPct * 10) / 10,
    total_ports: total,
    utilized_ports: used,
    free_ports: total - used,
    utilization_pct: Math.round(pct * 10) / 10,
  };
}

const EMPTY_SITE_STATS = statsFromAggregateRow({});

export function siteTerritoryValue(s) {
  const t = (s.territory || '').toString().trim();
  if (t) return t;
  return (s.area || '').toString();
}

async function aggregateSiteStatsBySiteId(vendor) {
  const v = (vendor || '').toString().trim();
  const hasVendor = v.length > 0;
  const rows = await db
    .prepare(
      `
    SELECT e.site_id,
      COUNT(DISTINCT e.id) AS equipment_count,
      COUNT(DISTINCT s.id) AS line_slot_count,
      COUNT(DISTINCT b.id) AS slot_count,
      COUNT(DISTINCT p.id) AS total_ports,
      COUNT(DISTINCT CASE WHEN p.is_utilized = 1 THEN p.id END) AS utilized_ports,
      COUNT(DISTINCT CASE WHEN b.is_utilized = 1 THEN b.id END) AS utilized_slot_count
    FROM equipment e
    LEFT JOIN slots s ON s.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = s.id
    LEFT JOIN equipment_bays b ON b.equipment_id = e.id
    WHERE 1=1
      ${hasVendor ? 'AND LOWER(TRIM(e.vendor)) = LOWER(TRIM(?))' : ''}
    GROUP BY e.site_id
  `,
    )
    .all(...(hasVendor ? [v] : []));

  const map = new Map();
  for (const row of rows) {
    map.set(row.site_id, statsFromAggregateRow(row));
  }
  return map;
}

async function aggregateSiteRouterTypesBySiteId() {
  const rows = await db
    .prepare(
      `
    SELECT site_id, GROUP_CONCAT(DISTINCT TRIM(router_type)) AS router_types_raw
    FROM equipment
    WHERE router_type IS NOT NULL AND TRIM(router_type) != ''
    GROUP BY site_id
  `,
    )
    .all();

  const map = new Map();
  for (const row of rows) {
    const types = (row.router_types_raw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .sort()
      .join(',');
    map.set(row.site_id, types || null);
  }
  return map;
}

async function querySiteRows(whereClause, sqlParams) {
  return db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM equipment e WHERE e.site_id = s.id) AS equipment_count
       FROM sites s
       ${whereClause}
       ORDER BY s.name`,
    )
    .all(...sqlParams);
}

function filterSitesByQuery(sites, q) {
  const needle = (q || '').toString().trim().toLowerCase();
  if (!needle) return sites;
  return sites.filter(
    (s) =>
      s.name.toLowerCase().includes(needle) ||
      s.plaid.toLowerCase().includes(needle) ||
      siteTerritoryValue(s).toLowerCase().includes(needle) ||
      s.area.toLowerCase().includes(needle) ||
      s.region.toLowerCase().includes(needle) ||
      (s.address && s.address.toLowerCase().includes(needle)),
  );
}

function attachSiteMetadata(sites, statsBySite, routerTypesBySite, lite) {
  return sites.map((s) => {
    const stats = lite ? null : statsBySite.get(s.id) || EMPTY_SITE_STATS;
    return {
      ...s,
      equipment_count: lite ? s.equipment_count || 0 : stats.equipment_count,
      total_ports: lite ? undefined : stats.total_ports,
      utilized_ports: lite ? undefined : stats.utilized_ports,
      utilization_pct: lite ? undefined : stats.utilization_pct,
      equipment_router_types: routerTypesBySite.get(s.id) ?? null,
    };
  });
}

/** @param {{ q?: string, vendor?: string, territory?: string, region?: string, lite?: boolean }} opts */
export async function listSites(opts = {}) {
  const q = (opts.q || '').toString().trim();
  const vendor = (opts.vendor || '').toString().trim();
  const territory = (opts.territory || '').toString().trim();
  const region = (opts.region || '').toString().trim();
  const lite = Boolean(opts.lite);

  const conditions = [];
  const sqlParams = [];
  if (territory) {
    conditions.push(`(COALESCE(NULLIF(TRIM(s.territory), ''), s.area) = ?)`);
    sqlParams.push(territory);
  }
  if (region) {
    conditions.push(`s.region = ?`);
    sqlParams.push(region);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const routerTypesPromise = aggregateSiteRouterTypesBySiteId();
  if (lite) {
    const [sites, routerTypesBySite] = await Promise.all([querySiteRows(whereClause, sqlParams), routerTypesPromise]);
    return attachSiteMetadata(filterSitesByQuery(sites, q), new Map(), routerTypesBySite, true);
  }

  const [sites, statsBySite, routerTypesBySite] = await Promise.all([
    querySiteRows(whereClause, sqlParams),
    aggregateSiteStatsBySiteId(vendor),
    routerTypesPromise,
  ]);
  return attachSiteMetadata(filterSitesByQuery(sites, q), statsBySite, routerTypesBySite, false);
}

export async function listSiteTerritories() {
  const rows = await db
    .prepare(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(territory), ''), area) AS t
       FROM sites
       WHERE COALESCE(NULLIF(TRIM(territory), ''), area) IS NOT NULL
         AND TRIM(COALESCE(NULLIF(TRIM(territory), ''), area)) != ''
       ORDER BY t`,
    )
    .all();
  return rows.map((r) => r.t);
}

export async function listSiteRegions() {
  const rows = await db
    .prepare(
      `SELECT DISTINCT region FROM sites WHERE region IS NOT NULL AND TRIM(region) != '' ORDER BY region`,
    )
    .all();
  return rows.map((r) => r.region);
}

export async function fetchInventoryBootstrap() {
  const [sites, regions, territories] = await Promise.all([
    listSites({ lite: true }),
    listSiteRegions(),
    listSiteTerritories(),
  ]);
  return { sites, regions, territories };
}
