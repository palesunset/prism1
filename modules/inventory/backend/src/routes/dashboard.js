import { Router } from 'express';
import db from '../db/index.js';

import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

/** @typedef {{ areas: string[], regions: string[], from: string, to: string, siteIds: string[], vendors: string[], routerTypes: string[] }} Filters */

function trimLower(s) {
  return (s || '').toString().trim();
}

function parseSiteIds(raw) {
  const s = (raw || '').toString().trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseCsvList(raw) {
  const s = (raw || '').toString().trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseRouterTypes(raw) {
  const s = (raw || '').toString().trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseFilters(req) {
  return {
    areas: parseCsvList(req.query.areas ?? req.query.area),
    regions: parseCsvList(req.query.regions ?? req.query.region),
    from: trimLower(req.query.from),
    to: trimLower(req.query.to),
    siteIds: parseSiteIds(req.query.site_ids),
    vendors: parseCsvList(req.query.vendors ?? req.query.vendor),
    routerTypes: parseRouterTypes(req.query.router_types),
  };
}

/** Case-insensitive IN on equipment.vendor (same semantics as site equipment stats). */
function vendorWhereSQL(f, equipmentAlias = 'e') {
  const list = f.vendors || [];
  if (!list.length) return { clause: '', params: [] };
  const ph = list.map(() => '?').join(',');
  return {
    clause: ` AND LOWER(TRIM(${equipmentAlias}.vendor)) IN (${ph})`,
    params: list.map((v) => v.toLowerCase()),
  };
}

/** For LEFT JOIN equipment e ON e.site_id = s.id … */
function vendorJoinOnSQL(f, equipmentAlias = 'e') {
  const list = f.vendors || [];
  if (!list.length) return { clause: '', params: [] };
  const ph = list.map(() => '?').join(',');
  return {
    clause: ` AND LOWER(TRIM(${equipmentAlias}.vendor)) IN (${ph})`,
    params: list.map((v) => v.toLowerCase()),
  };
}

/** Router type filter on equipment.router_type (exact match). */
function routerTypeWhereSQL(f, equipmentAlias = 'e') {
  const list = f.routerTypes || [];
  if (!list.length) return { clause: '', params: [] };
  const ph = list.map(() => '?').join(',');
  return {
    clause: ` AND TRIM(COALESCE(${equipmentAlias}.router_type, '')) IN (${ph})`,
    params: list,
  };
}

/** For LEFT JOIN equipment e ON e.site_id = s.id … */
function routerTypeJoinOnSQL(f, equipmentAlias = 'e') {
  const list = f.routerTypes || [];
  if (!list.length) return { clause: '', params: [] };
  const ph = list.map(() => '?').join(',');
  return {
    clause: ` AND TRIM(COALESCE(${equipmentAlias}.router_type, '')) IN (${ph})`,
    params: list,
  };
}

/**
 * @param {string} siteAlias
 * @param {Filters} f
 * @returns {{ clause: string, params: string[] }}
 */
function siteFilterSQL(siteAlias, f) {
  const parts = [];
  const params = [];
  if (f.areas?.length) {
    const ph = f.areas.map(() => '?').join(',');
    parts.push(`LOWER(TRIM(${siteAlias}.area)) IN (${ph})`);
    params.push(...f.areas.map((a) => a.toLowerCase()));
  }
  if (f.regions?.length) {
    const ph = f.regions.map(() => '?').join(',');
    parts.push(`LOWER(TRIM(${siteAlias}.region)) IN (${ph})`);
    params.push(...f.regions.map((r) => r.toLowerCase()));
  }
  if (f.siteIds && f.siteIds.length > 0) {
    const ph = f.siteIds.map(() => '?').join(',');
    parts.push(`${siteAlias}.id IN (${ph})`);
    params.push(...f.siteIds);
  }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params };
}

/**
 * Activity window for created_at / event timestamps (inclusive ISO dates).
 * @param {Filters} f
 * @returns {{ clause: string, params: string[] }}
 */
function activityRangeSQL(alias, f) {
  if (!f.from && !f.to) return { clause: '', params: [] };
  const parts = [];
  const params = [];
  if (f.from) {
    parts.push(`date(${alias}) >= date(?)`);
    params.push(f.from);
  }
  if (f.to) {
    parts.push(`date(${alias}) <= date(?)`);
    params.push(f.to);
  }
  return { clause: parts.length ? `AND ${parts.join(' AND ')}` : '', params };
}

router.get('/kpis', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vf = vendorWhereSQL(f, 'e');
  const rf = routerTypeWhereSQL(f, 'e');

  const needsEquipJoin = Boolean(f.vendors?.length) || (f.routerTypes && f.routerTypes.length > 0);
  const sitesSql = needsEquipJoin
    ? `
    SELECT COUNT(DISTINCT s.id) AS c
    FROM sites s
    JOIN equipment e ON e.site_id = s.id
    WHERE 1=1 ${sf.clause} ${vf.clause} ${rf.clause}
  `
    : `SELECT COUNT(*) AS c FROM sites s WHERE 1=1 ${sf.clause}`;

  const sitesRow = needsEquipJoin
    ? await db.prepare(sitesSql).get(...sf.params, ...vf.params, ...rf.params)
    : await db.prepare(sitesSql).get(...sf.params);

  const row = (await db
    .prepare(
      `
    SELECT
      COUNT(DISTINCT e.id) AS total_equipment,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports,
      COUNT(DISTINCT CASE
        WHEN LOWER(COALESCE(NULLIF(TRIM(e.status), ''), 'active')) = 'active' THEN e.id END) AS active_equipment,
      COUNT(DISTINCT CASE
        WHEN e.end_of_life IS NOT NULL AND TRIM(e.end_of_life) != ''
          AND strftime('%Y', e.end_of_life) = strftime('%Y', 'now')
        THEN e.id END) AS eol_this_year
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = sl.id
    WHERE 1=1 ${sf.clause} ${vf.clause} ${rf.clause}
  `,
    )
    .get(...sf.params, ...vf.params, ...rf.params)) || {};

  const totalPorts = row.total_ports || 0;
  const utilized = row.utilized_ports || 0;
  const utilPct = totalPorts > 0 ? Math.round((utilized / totalPorts) * 1000) / 10 : 0;

  let equipmentAddedInRange = null;
  if (f.from || f.to) {
    const arOnly = activityRangeSQL('e.created_at', f);
    const r2 = await db
      .prepare(
        `
      SELECT COUNT(*) AS c
      FROM equipment e
      JOIN sites s ON s.id = e.site_id
      WHERE 1=1 ${sf.clause} ${vf.clause} ${rf.clause} ${arOnly.clause}
    `
      )
      .get(...sf.params, ...vf.params, ...rf.params, ...arOnly.params);
    equipmentAddedInRange = r2.c || 0;
  }

  const spark = await db
    .prepare(
      `
    SELECT strftime('%Y-%m', e.created_at) AS month, COUNT(*) AS equipment
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    WHERE datetime(e.created_at) >= datetime('now', '-6 months')
      ${sf.clause} ${vf.clause} ${rf.clause}
    GROUP BY month
    ORDER BY month
  `
    )
    .all(...sf.params, ...vf.params, ...rf.params);

  const prev = await db
    .prepare(
      `
    SELECT COUNT(*) AS c
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    WHERE datetime(e.created_at) >= datetime('now', '-60 days')
      AND datetime(e.created_at) < datetime('now', '-30 days')
      ${sf.clause} ${vf.clause} ${rf.clause}
  `
    )
    .get(...sf.params, ...vf.params, ...rf.params);
  const last30 = await db
    .prepare(
      `
    SELECT COUNT(*) AS c
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    WHERE datetime(e.created_at) >= datetime('now', '-30 days')
      ${sf.clause} ${vf.clause} ${rf.clause}
  `
    )
    .get(...sf.params, ...vf.params, ...rf.params);
  const prevC = prev.c || 0;
  const lastC = last30.c || 0;
  const equipTrendPct =
    prevC > 0 ? Math.round(((lastC - prevC) / prevC) * 1000) / 10 : lastC > 0 ? 100 : 0;

  res.json({
    totalSites: sitesRow?.c || 0,
    totalEquipment: row.total_equipment || 0,
    totalPorts,
    utilizedPorts: utilized,
    utilizationPercent: utilPct,
    activeEquipment: row.active_equipment || 0,
    eolThisYear: row.eol_this_year || 0,
    equipmentAddedInRange,
    sparklineEquipmentByMonth: spark.map((x) => ({ month: x.month, equipment: x.equipment || 0 })),
    equipmentAddedTrendPercent: equipTrendPct,
    equipmentAddedLast30Days: lastC,
  });
});

router.get('/vendor-distribution', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vf = vendorWhereSQL(f, 'e');
  const rf = routerTypeWhereSQL(f, 'e');
  const rows = await db
    .prepare(
      `
    SELECT TRIM(e.vendor) AS name, COUNT(*) AS count
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    WHERE TRIM(COALESCE(e.vendor, '')) != ''
      ${sf.clause} ${vf.clause} ${rf.clause}
    GROUP BY LOWER(TRIM(e.vendor))
    ORDER BY count DESC
  `
    )
    .all(...sf.params, ...vf.params, ...rf.params);

  const total = rows.reduce((a, r) => a + (r.count || 0), 0) || 1;
  const top = rows.slice(0, 8);
  const rest = rows.slice(8);
  const other = rest.reduce((a, r) => a + (r.count || 0), 0);
  const list = [...top];
  if (other > 0) list.push({ name: 'Other', count: other });

  const vendors = list.map((r) => ({
    name: r.name || 'Unknown',
    count: r.count,
    percent: Math.round(((r.count / total) * 1000)) / 10,
  }));

  res.json({ vendors });
});

router.get('/status-distribution', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vf = vendorWhereSQL(f, 'e');
  const rf = routerTypeWhereSQL(f, 'e');
  const rows = await db
    .prepare(
      `
    SELECT COALESCE(NULLIF(TRIM(e.status), ''), 'Active') AS status, COUNT(*) AS count
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    WHERE 1=1 ${sf.clause} ${vf.clause} ${rf.clause}
    GROUP BY COALESCE(NULLIF(TRIM(e.status), ''), 'Active')
    ORDER BY count DESC
  `
    )
    .all(...sf.params, ...vf.params, ...rf.params);

  res.json({ statuses: rows.map((r) => ({ status: r.status, count: r.count || 0 })) });
});

router.get('/site-utilization', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vj = vendorJoinOnSQL(f, 'e');
  const rj = routerTypeJoinOnSQL(f, 'e');
  const sort = trimLower(req.query.sort) || 'util_desc';

  const rows = await db
    .prepare(
      `
    SELECT
      s.id,
      s.name,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM sites s
    LEFT JOIN equipment e ON e.site_id = s.id${vj.clause}${rj.clause}
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = sl.id
    WHERE 1=1 ${sf.clause}
    GROUP BY s.id
  `
    )
    .all(...vj.params, ...rj.params, ...sf.params);

  const mapped = rows.map((r) => {
    const total = r.total_ports || 0;
    const used = r.utilized_ports || 0;
    const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
    return {
      id: r.id,
      name: r.name,
      totalPorts: total,
      utilizedPorts: used,
      freePorts: total - used,
      percent: pct,
    };
  });

  mapped.sort((a, b) => {
    if (sort === 'util_asc') return a.percent - b.percent;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return b.percent - a.percent;
  });

  res.json({ sites: mapped });
});

router.get('/equipment-utilization', async (req, res) => {
  const f = parseFilters(req);
  const siteId = trimLower(req.query.site_id);
  if (!siteId) {
    return res.json({ equipment: [], siteId: null, siteName: null });
  }

  const site = await db.prepare('SELECT id, name FROM sites WHERE id = ?').get(siteId);
  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }

  const sf = siteFilterSQL('s', f);
  const vf = vendorWhereSQL(f, 'e');
  const rf = routerTypeWhereSQL(f, 'e');
  const sort = trimLower(req.query.sort) || 'util_desc';

  const rows = await db
    .prepare(
      `
    SELECT
      e.id,
      e.vendor,
      e.model,
      COALESCE(NULLIF(TRIM(e.network_element), ''), e.model) AS network_element,
      e.serial_number,
      e.router_type,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = sl.id
    WHERE e.site_id = ? ${sf.clause} ${vf.clause} ${rf.clause}
    GROUP BY e.id
  `
    )
    .all(siteId, ...sf.params, ...vf.params, ...rf.params);

  const mapped = rows.map((r) => {
    const total = r.total_ports || 0;
    const used = r.utilized_ports || 0;
    const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
    const ne = r.network_element || r.model || 'Equipment';
    const serial = (r.serial_number || '').trim();
    return {
      id: r.id,
      label: ne,
      vendor: r.vendor,
      model: r.model,
      networkElement: ne,
      serialNumber: serial || null,
      routerType: r.router_type || null,
      totalPorts: total,
      utilizedPorts: used,
      freePorts: total - used,
      percent: pct,
    };
  });

  mapped.sort((a, b) => {
    if (sort === 'util_asc') return a.percent - b.percent;
    if (sort === 'name') return a.label.localeCompare(b.label);
    return b.percent - a.percent;
  });

  res.json({ equipment: mapped, siteId: site.id, siteName: site.name });
});

router.get('/area-region-breakdown', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vj = vendorJoinOnSQL(f, 'e');
  const rj = routerTypeJoinOnSQL(f, 'e');
  const rows = await db
    .prepare(
      `
    SELECT s.area, s.region, COUNT(e.id) AS equipment_count
    FROM sites s
    LEFT JOIN equipment e ON e.site_id = s.id${vj.clause}${rj.clause}
    WHERE 1=1 ${sf.clause}
    GROUP BY s.area, s.region
    ORDER BY s.area, s.region
  `
    )
    .all(...vj.params, ...rj.params, ...sf.params);

  const byArea = new Map();
  for (const r of rows) {
    const a = r.area || 'Unknown';
    if (!byArea.has(a)) byArea.set(a, { area: a, equipment: 0, regions: [] });
    const entry = byArea.get(a);
    const c = r.equipment_count || 0;
    entry.equipment += c;
    entry.regions.push({ region: r.region || '—', count: c });
  }

  const byRegion = new Map();
  for (const r of rows) {
    const reg = r.region || 'Unknown';
    if (!byRegion.has(reg)) byRegion.set(reg, { region: reg, equipment: 0 });
    byRegion.get(reg).equipment += r.equipment_count || 0;
  }

  res.json({
    rows: rows.map((r) => ({
      area: r.area,
      region: r.region,
      equipmentCount: r.equipment_count || 0,
    })),
    byArea: [...byArea.values()],
    byRegion: [...byRegion.values()].sort((a, b) => b.equipment - a.equipment),
  });
});

router.get('/eol-timeline', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vf = vendorWhereSQL(f, 'e');
  const rf = routerTypeWhereSQL(f, 'e');

  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: key });
  }

  let cum = 0;
  const points = [];
  for (const m of months) {
    const hit = await db
      .prepare(
        `
      SELECT COUNT(*) AS c
      FROM equipment e
      JOIN sites s ON s.id = e.site_id
      WHERE e.end_of_life IS NOT NULL AND TRIM(e.end_of_life) != ''
        AND strftime('%Y-%m', e.end_of_life) = ?
        ${sf.clause} ${vf.clause} ${rf.clause}
    `,
      )
      .get(m.key, ...sf.params, ...vf.params, ...rf.params);
    const count = hit.c || 0;
    cum += count;
    points.push({ month: m.key, label: m.label, count, cumulative: cum });
  }

  res.json({ points });
});

router.get('/top-sites', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vj = vendorJoinOnSQL(f, 'e');
  const rj = routerTypeJoinOnSQL(f, 'e');
  const rows = await db
    .prepare(
      `
    SELECT s.id, s.name, COUNT(e.id) AS equipment_count
    FROM sites s
    LEFT JOIN equipment e ON e.site_id = s.id${vj.clause}${rj.clause}
    WHERE 1=1 ${sf.clause}
    GROUP BY s.id
    ORDER BY equipment_count DESC
    LIMIT 5
  `
    )
    .all(...vj.params, ...rj.params, ...sf.params);

  res.json({ sites: rows.map((r) => ({ id: r.id, name: r.name, equipmentCount: r.equipment_count || 0 })) });
});

router.get('/recent-activity', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const vf = vendorWhereSQL(f, 'e');
  const rf = routerTypeWhereSQL(f, 'e');
  const ar = activityRangeSQL('t.at', f);

  const sql = `
    SELECT kind, at, description, site_name, ref_id
    FROM (
      SELECT
        'equipment_created' AS kind,
        e.created_at AS at,
        'Equipment added: ' || e.vendor || ' ' || e.model AS description,
        s.name AS site_name,
        e.id AS ref_id
      FROM equipment e
      JOIN sites s ON s.id = e.site_id
      WHERE 1=1 ${sf.clause} ${vf.clause} ${rf.clause}

      UNION ALL

      SELECT
        'equipment_updated' AS kind,
        e.updated_at AS at,
        'Equipment updated: ' || e.vendor || ' ' || e.model AS description,
        s.name AS site_name,
        e.id AS ref_id
      FROM equipment e
      JOIN sites s ON s.id = e.site_id
      WHERE e.updated_at > e.created_at
        ${sf.clause} ${vf.clause} ${rf.clause}

      UNION ALL

      SELECT
        'port_updated' AS kind,
        p.updated_at AS at,
        'Port ' || p.port_number || ' in slot ' || COALESCE(sl.slot_name, '') AS description,
        s.name AS site_name,
        p.id AS ref_id
      FROM ports p
      JOIN slots sl ON sl.id = p.slot_id
      JOIN equipment e ON e.id = sl.equipment_id
      JOIN sites s ON s.id = e.site_id
      WHERE p.updated_at > p.created_at
        ${sf.clause} ${vf.clause} ${rf.clause}
    ) AS t
    WHERE 1=1 ${ar.clause}
    ORDER BY datetime(t.at) DESC
    LIMIT 20
  `;

  const rows = await db
    .prepare(sql)
    .all(
      ...sf.params,
      ...vf.params,
      ...rf.params,
      ...sf.params,
      ...vf.params,
      ...rf.params,
      ...sf.params,
      ...vf.params,
      ...rf.params,
      ...ar.params
    );

  res.json({
    events: rows.map((r) => ({
      kind: r.kind,
      at: r.at,
      description: r.description,
      siteName: r.site_name,
      refId: r.ref_id,
    })),
  });
});

router.get('/sites-overview', async (req, res) => {
  const f = parseFilters(req);
  const sf = siteFilterSQL('s', f);
  const q = trimLower(req.query.q).toLowerCase();

  let sites = await db.prepare(`SELECT * FROM sites s WHERE 1=1 ${sf.clause} ORDER BY s.name`).all(...sf.params);

  if (q) {
    sites = sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.plaid.toLowerCase().includes(q) ||
        s.area.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
  }

  const vf = vendorWhereSQL(f, 'e');
  const rf = routerTypeWhereSQL(f, 'e');
  const rows = [];
  for (const s of sites) {
    const stats = await db
      .prepare(
        `
      SELECT
        COUNT(DISTINCT e.id) AS equipment_count,
        COUNT(p.id) AS total_ports,
        COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
      FROM equipment e
      LEFT JOIN slots sl ON sl.equipment_id = e.id
      LEFT JOIN ports p ON p.slot_id = sl.id
      WHERE e.site_id = ? ${vf.clause} ${rf.clause}
    `,
      )
      .get(s.id, ...vf.params, ...rf.params);
    const total = stats.total_ports || 0;
    const used = stats.utilized_ports || 0;
    const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
    const eq = stats.equipment_count || 0;
    const operationalStatus =
      eq > 0 ? 'Active' : f.vendors?.length ? 'No match' : 'Inactive';
    rows.push({
      id: s.id,
      name: s.name,
      plaid: s.plaid,
      area: s.area,
      region: s.region,
      address: s.address,
      equipment_count: eq,
      total_ports: total,
      utilized_ports: used,
      utilization_pct: pct,
      operational_status: operationalStatus,
    });
  }

  res.json({ sites: rows });
});

promisifyRouter(router);

export default router;
