/**
 * Deterministic inventory Q&A for Oz (no LLM). Returns direct text or SQL to run.
 */
import db from '../db/index.js';
import {
  FULL_EQUIPMENT_DETAIL_FIELDS,
  buildEquipmentDetailSql,
  parseRequestedEquipmentFields,
} from './ozEquipmentDetail.js';

const ROUTER_TYPE_MAP = { PEE: 'PEe', PEC: 'PEc' };

function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\bhoaw\b/g, 'how')
    .replace(/\bhwo\b/g, 'how')
    .trim();
}

function looksLikeHowMany(t) {
  return (
    t.includes('how many') ||
    t.includes('how man') ||
    t.startsWith('count ') ||
    t.startsWith('counts ')
  );
}

function looksLikeList(t) {
  return /\b(list|show|display|what are|which|can you|could you)\b/.test(t);
}

function parseStatusFilter(text) {
  const t = norm(text);
  for (const s of ['Active', 'Decommissioned', 'Maintenance', 'Spare']) {
    if (new RegExp(`\\b${s.toLowerCase()}\\b`, 'i').test(t)) return s;
  }
  return null;
}

function parseSerialHint(raw) {
  const s = String(raw || '');
  const explicit = s.match(/\b(?:serial(?:\s+number)?|sn)\s*[:#=]\s*([A-Za-z0-9-]+)/i);
  if (explicit && !/^number$/i.test(explicit[1])) return explicit[1];
  const token = s.match(/\b(SN[A-Z0-9-]+|OZ-[A-Z0-9-]+)\b/i);
  if (token) return token[1];
  const inline = s.match(/\b(?:serial(?:\s+number)?|sn)\s+(?!number\b)([A-Za-z0-9][A-Za-z0-9-]{2,})\b/i);
  if (inline) {
    const v = inline[1];
    if (/^(for|at|in|of|the|all|each|every|with|and|or)$/i.test(v)) return null;
    if (/[0-9]/.test(v) || /^SN/i.test(v)) return v;
  }
  return null;
}

function looksLikeEquipmentFieldQuery(t, raw, ctx) {
  const fields = parseRequestedEquipmentFields(raw);
  if (!fields?.length) return null;
  const hasContext =
    looksLikeList(t) ||
    /\b(show|what|which|get|give|find)\b/.test(t) ||
    ctx.site ||
    ctx.vendor ||
    ctx.rt ||
    ctx.statusFilter ||
    ctx.serialHint ||
    fields.length >= 1;
  if (!hasContext) return null;
  return fields;
}

function parseRouterTypeToken(text) {
  const upper = String(text || '').toUpperCase();
  for (const k of ['PEE', 'PEC', 'FMAGG', 'AGG', 'DR', 'BR', 'RR', 'AG', 'P']) {
    if (new RegExp(`\\b${k}\\b`, 'i').test(upper)) {
      return ROUTER_TYPE_MAP[k] || k;
    }
  }
  return null;
}

function listRegions() {
  return db
    .prepare(
      `SELECT DISTINCT TRIM(region) AS region FROM sites WHERE region IS NOT NULL AND TRIM(region) != '' ORDER BY region`
    )
    .all()
    .map((r) => r.region);
}

function listTerritories() {
  return db
    .prepare(
      `SELECT DISTINCT TRIM(COALESCE(NULLIF(TRIM(territory), ''), area)) AS t
       FROM sites WHERE TRIM(COALESCE(NULLIF(TRIM(territory), ''), area)) != ''
       ORDER BY t`
    )
    .all()
    .map((r) => r.t);
}

function listVendors() {
  return db
    .prepare(
      `SELECT DISTINCT TRIM(vendor) AS vendor FROM equipment WHERE TRIM(vendor) != '' ORDER BY LOWER(vendor)`
    )
    .all()
    .map((r) => r.vendor);
}

function findInList(text, items) {
  const t = norm(text);
  const sorted = [...items].sort((a, b) => b.length - a.length);
  for (const item of sorted) {
    const needle = String(item).toLowerCase();
    if (!item || needle.length < 3) continue;
    if (t.includes(needle)) return item;
  }
  return null;
}

function findSite(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  const lq = q.toLowerCase();
  const sites = db
    .prepare(`SELECT id, name, plaid, area, region, territory FROM sites ORDER BY LENGTH(name) DESC`)
    .all();
  const plaidExact = sites.find((s) => String(s.plaid || '').trim().toLowerCase() === lq);
  if (plaidExact) return plaidExact;
  for (const s of sites) {
    const name = String(s.name || '').trim().toLowerCase();
    const plaid = String(s.plaid || '').trim().toLowerCase();
    if (name && name.length >= 4 && !/^(site|each|every)$/i.test(name) && lq.includes(name)) return s;
    if (plaid && plaid.length >= 4 && lq.includes(plaid)) return s;
  }
  return null;
}

function sqlLit(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

export function buildInventoryContextBlock() {
  const siteCount = db.prepare('SELECT COUNT(*) AS c FROM sites').get()?.c ?? 0;
  const equipCount = db.prepare('SELECT COUNT(*) AS c FROM equipment').get()?.c ?? 0;
  const regions = listRegions().slice(0, 12);
  const vendors = listVendors().slice(0, 12);
  const routerTypes = db
    .prepare(
      `SELECT TRIM(router_type) AS rt, COUNT(*) AS c FROM equipment
       WHERE router_type IS NOT NULL AND TRIM(router_type) != ''
       GROUP BY TRIM(router_type) ORDER BY c DESC LIMIT 12`
    )
    .all()
    .map((r) => `${r.rt} (${r.c})`);

  return [
    '## LIVE INVENTORY SNAPSHOT (use for filters; do not invent values)',
    `Sites: ${siteCount} | Equipment: ${equipCount}`,
    regions.length ? `Regions in DB: ${regions.join(', ')}` : 'Regions: (none yet)',
    vendors.length ? `Vendors in DB: ${vendors.join(', ')}` : 'Vendors: (none yet)',
    routerTypes.length ? `Router types (count): ${routerTypes.join(', ')}` : 'Router types: (none set)',
    'Equipment fields include software_version, descriptor_version, ip_address, network_element.',
    'Never use a location column — filter places via sites.name, region, territory, area, or address.',
  ].join('\n');
}

export function formatOzHelp() {
  return [
    "I'm **Oz**, your inventory assistant. I answer from your real **SQLite** data only.",
    '',
    '**Try asking:**',
    '• Overview / inventory summary',
    '• How many sites? How many equipment?',
    '• How many P routers? Router type counts',
    '• List sites in NCR (or your region name)',
    '• List equipment at VALERO (site name or PLAID)',
    '• Port utilization for a site',
    '• Equipment reaching EOL this year',
    '• Vendor distribution / router type counts',
    '• Sites with no equipment',
    '• DR routers with available ports',
    '• How many Nokia in each site (vendor per site)',
    '• **Equipment fields:** network element, IP address, router type, software version, model, serial, EOL, status',
    '• Mix fields: e.g. "List IP address and router type for Active P routers at VALERO"',
    '• "Show model, serial, and software version for Nokia equipment"',
    '',
    'Tip: include a **site name**, **PLAID**, **region**, or **vendor** for sharper answers.',
  ].join('\n');
}

function formatOverview() {
  const row =
    db
      .prepare(
        `
    SELECT
      COUNT(DISTINCT s.id) AS site_count,
      COUNT(DISTINCT e.id) AS equipment_count,
      COUNT(DISTINCT p.id) AS port_count,
      COUNT(DISTINCT CASE WHEN p.is_utilized = 1 THEN p.id END) AS utilized_ports,
      COUNT(DISTINCT LOWER(TRIM(e.vendor))) AS vendor_count
    FROM sites s
    LEFT JOIN equipment e ON e.site_id = s.id
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = sl.id
  `
      )
      .get() || {};
  const total = row.port_count || 0;
  const used = row.utilized_ports || 0;
  const pct = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';
  return [
    '**Inventory overview**',
    '',
    `• **Sites:** ${row.site_count || 0}`,
    `• **Equipment:** ${row.equipment_count || 0}`,
    `• **Vendors:** ${row.vendor_count || 0}`,
    `• **Ports:** ${used}/${total} utilized (${pct}%)`,
    '',
    'Ask for **list sites**, **router type counts**, or **equipment at** a site name for more detail.',
  ].join('\n');
}

/**
 * @returns {{ type: 'direct', response: string } | { type: 'sql', sql: string } | null}
 */
export function tryInventoryIntent(userMessage) {
  const raw = String(userMessage ?? '').trim();
  if (!raw) return null;
  const t = norm(raw);

  if (/^(help|menu|start)$/i.test(raw) || t === 'what can you do') {
    return { type: 'direct', response: formatOzHelp() };
  }

  if (/\b(overview|summary|snapshot)\b/.test(t) && !looksLikeHowMany(t)) {
    return { type: 'direct', response: formatOverview() };
  }

  const region = findInList(raw, listRegions());
  const territory = findInList(raw, listTerritories());
  const vendor = findInList(raw, listVendors());
  const site = findSite(raw);
  const rt = parseRouterTypeToken(raw);
  const statusFilter = parseStatusFilter(raw);
  const serialHint = parseSerialHint(raw);
  const filterCtx = { site, vendor, region, territory, rt, statusFilter, serialHint };

  const fieldKeys = looksLikeEquipmentFieldQuery(t, raw, filterCtx);
  if (fieldKeys) {
    const yearOnly =
      fieldKeys.includes('end_of_life') &&
      (t.includes('this year') || t.includes(String(new Date().getFullYear())));
    return {
      type: 'sql',
      sql: buildEquipmentDetailSql(fieldKeys, filterCtx, {
        eolYear: yearOnly ? new Date().getFullYear() : null,
      }),
    };
  }

  if (looksLikeList(t) && /\bvendors?\b/.test(t) && !vendor) {
    return {
      type: 'sql',
      sql: `SELECT TRIM(vendor) AS vendor, COUNT(*) AS equipment_count
            FROM equipment WHERE TRIM(vendor) != ''
            GROUP BY LOWER(TRIM(vendor)) ORDER BY equipment_count DESC LIMIT 50`,
    };
  }

  if (
    (looksLikeList(t) || t.includes('router type')) &&
    (t.includes('router type') || t.includes('router types')) &&
    !rt
  ) {
    return {
      type: 'sql',
      sql: `SELECT TRIM(router_type) AS router_type, COUNT(*) AS equipment_count
            FROM equipment WHERE router_type IS NOT NULL AND TRIM(router_type) != ''
            GROUP BY TRIM(router_type) ORDER BY equipment_count DESC LIMIT 50`,
    };
  }

  if (looksLikeHowMany(t) && /\bsites?\b/.test(t) && !/\bequipments?\b/.test(t)) {
    let sql = `SELECT COUNT(*) AS site_count FROM sites s WHERE 1=1`;
    if (region) sql += ` AND LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})`;
    return { type: 'sql', sql };
  }

  if (looksLikeHowMany(t) && rt && /\brouter/.test(t)) {
    let sql = `SELECT COUNT(*) AS count FROM equipment e JOIN sites s ON e.site_id = s.id WHERE 1=1`;
    if (region) sql += ` AND LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})`;
    if (site) sql += ` AND s.id = ${sqlLit(site.id)}`;
    if (vendor) sql += ` AND LOWER(TRIM(e.vendor)) = LOWER(${sqlLit(vendor)})`;
    if (rt === 'PEe' || rt === 'PEc') sql += ` AND LOWER(TRIM(e.router_type)) = ${sqlLit(rt.toLowerCase())}`;
    else sql += ` AND UPPER(TRIM(e.router_type)) = ${sqlLit(rt.toUpperCase())}`;
    return { type: 'sql', sql };
  }

  if (
    looksLikeHowMany(t) &&
    vendor &&
    (/\b(per site|each site|by site|every site)\b/.test(t) || /\bin each site\b/.test(t))
  ) {
    let sql = `SELECT s.name AS site_name, COUNT(e.id) AS equipment_count
      FROM sites s
      LEFT JOIN equipment e ON e.site_id = s.id AND LOWER(TRIM(e.vendor)) = LOWER(${sqlLit(vendor)})
      GROUP BY s.id, s.name
      HAVING equipment_count > 0
      ORDER BY equipment_count DESC, s.name LIMIT 50`;
    if (region) {
      sql = `SELECT s.name AS site_name, COUNT(e.id) AS equipment_count
        FROM sites s
        JOIN equipment e ON e.site_id = s.id AND LOWER(TRIM(e.vendor)) = LOWER(${sqlLit(vendor)})
        WHERE LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})
        GROUP BY s.id, s.name
        ORDER BY equipment_count DESC, s.name LIMIT 50`;
    }
    return { type: 'sql', sql };
  }

  if (looksLikeHowMany(t) && (/\bequipments?\b|\bdevices?\b/.test(t) || (/\brouter/.test(t) && !rt))) {
    let sql = `SELECT COUNT(*) AS equipment_count FROM equipment e JOIN sites s ON e.site_id = s.id WHERE 1=1`;
    if (region) sql += ` AND LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})`;
    if (territory) {
      sql += ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.territory), ''), s.area))) = LOWER(${sqlLit(territory)})`;
    }
    if (site) sql += ` AND s.id = ${sqlLit(site.id)}`;
    if (vendor) sql += ` AND LOWER(TRIM(e.vendor)) = LOWER(${sqlLit(vendor)})`;
    if (statusFilter) sql += ` AND LOWER(TRIM(e.status)) = LOWER(${sqlLit(statusFilter)})`;
    return { type: 'sql', sql };
  }

  if (
    (looksLikeList(t) || t.includes('what sites')) &&
    /\bsites?\b/.test(t) &&
    !/\bequipments?\b/.test(t)
  ) {
    let sql = `SELECT s.name, s.plaid, s.region,
      COALESCE(NULLIF(TRIM(s.territory), ''), s.area) AS territory,
      COUNT(DISTINCT e.id) AS equipment_count
      FROM sites s LEFT JOIN equipment e ON e.site_id = s.id WHERE 1=1`;
    if (region) sql += ` AND LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})`;
    if (territory) {
      sql += ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(s.territory), ''), s.area))) = LOWER(${sqlLit(territory)})`;
    }
    sql += ` GROUP BY s.id ORDER BY s.name LIMIT 50`;
    return { type: 'sql', sql };
  }

  if (
    (looksLikeList(t) || t.includes('what equipment') || t.includes('which equipment')) &&
    (/\bequipments?\b|\bdevices?\b|\brouters?\b/.test(t) || site || region || vendor)
  ) {
    return {
      type: 'sql',
      sql: buildEquipmentDetailSql(FULL_EQUIPMENT_DETAIL_FIELDS, filterCtx),
    };
  }

  if (/\b(utilization|utilised|utilized)\b/.test(t) && (site || /\bby site\b/.test(t))) {
    if (site) {
      return {
        type: 'sql',
        sql: `SELECT s.name AS site_name,
              COUNT(p.id) AS total_ports,
              COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
              FROM sites s
              LEFT JOIN equipment e ON e.site_id = s.id
              LEFT JOIN slots sl ON sl.equipment_id = e.id
              LEFT JOIN ports p ON p.slot_id = sl.id
              WHERE s.id = ${sqlLit(site.id)}
              GROUP BY s.id, s.name LIMIT 5`,
      };
    }
    return {
      type: 'sql',
      sql: `SELECT s.name AS site_name,
            COUNT(p.id) AS total_ports,
            COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
            FROM sites s
            LEFT JOIN equipment e ON e.site_id = s.id
            LEFT JOIN slots sl ON sl.equipment_id = e.id
            LEFT JOIN ports p ON p.slot_id = sl.id
            GROUP BY s.id, s.name
            HAVING total_ports > 0
            ORDER BY utilized_ports * 1.0 / total_ports DESC
            LIMIT 20`,
    };
  }

  if (
    /\brouter type counts?\b/.test(t) ||
    /\bcounts?\s+by\s+router\s+type\b/.test(t) ||
    (/\brouter types?\b/.test(t) && /\bcount\b/.test(t))
  ) {
    return {
      type: 'sql',
      sql: `SELECT TRIM(router_type) AS router_type, COUNT(*) AS equipment_count
            FROM equipment WHERE router_type IS NOT NULL AND TRIM(router_type) != ''
            GROUP BY TRIM(router_type) ORDER BY equipment_count DESC LIMIT 50`,
    };
  }

  if (
    /\b(vendor distribution|distribution by vendor|equipments? by vendor|vendor breakdown)\b/.test(t) ||
    (/\bdistribution\b/.test(t) && /\bvendor\b/.test(t))
  ) {
    return {
      type: 'sql',
      sql: `SELECT TRIM(vendor) AS vendor, COUNT(*) AS equipment_count
            FROM equipment WHERE TRIM(vendor) != ''
            GROUP BY LOWER(TRIM(vendor)) ORDER BY equipment_count DESC LIMIT 50`,
    };
  }

  if (
    /\b(sites?\s+with\s+no\s+equipment|empty\s+sites?|sites?\s+without\s+equipment|sites?\s+with\s+zero\s+equipment)\b/.test(
      t
    )
  ) {
    let sql = `SELECT s.name, s.plaid, s.region,
      COALESCE(NULLIF(TRIM(s.territory), ''), s.area) AS territory
      FROM sites s
      LEFT JOIN equipment e ON e.site_id = s.id
      WHERE e.id IS NULL`;
    if (region) sql += ` AND LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})`;
    sql += ` ORDER BY s.name LIMIT 50`;
    return { type: 'sql', sql };
  }

  const wantsFreePorts = /\b(available|free|unused|open)\s+ports?\b/.test(t);
  const drRouter = rt === 'DR' || /\bdr\s+router/.test(t);
  if (wantsFreePorts && drRouter) {
    let sql = `SELECT s.name AS site_name,
      TRIM(e.vendor) || ' ' || TRIM(e.model) || ' · ' || TRIM(e.serial_number) AS equipment,
      TRIM(e.router_type) AS router_type,
      COUNT(p.id) AS free_ports
      FROM equipment e
      JOIN sites s ON e.site_id = s.id
      JOIN slots sl ON sl.equipment_id = e.id
      JOIN ports p ON p.slot_id = sl.id AND p.is_utilized = 0
      WHERE UPPER(TRIM(e.router_type)) = 'DR'`;
    if (site) sql += ` AND s.id = ${sqlLit(site.id)}`;
    if (region) sql += ` AND LOWER(TRIM(s.region)) = LOWER(${sqlLit(region)})`;
    sql += ` GROUP BY e.id ORDER BY free_ports DESC, s.name LIMIT 50`;
    return { type: 'sql', sql };
  }

  if (
    (looksLikeList(t) || /\bshow\b/.test(t)) &&
    (rt || /\bp\s+routers?\b/.test(t) || /\bcore\s+routers?\b/.test(t)) &&
    !looksLikeHowMany(t)
  ) {
    const effectiveRt = rt || (/\bp\s+routers?\b|\bcore\s+routers?\b/.test(t) ? 'P' : null);
    const rtCtx = effectiveRt ? { ...filterCtx, rt: effectiveRt } : filterCtx;
    return {
      type: 'sql',
      sql: buildEquipmentDetailSql(FULL_EQUIPMENT_DETAIL_FIELDS, rtCtx),
    };
  }

  if (
    /\b(eol this year|eol\b)/.test(t) &&
    !/\bnext year\b/.test(t) &&
    (t.includes('this year') || t.includes(String(new Date().getFullYear())) || /\beol\b/.test(t))
  ) {
    const yearOnly =
      t.includes('this year') || t.includes(String(new Date().getFullYear()));
    return {
      type: 'sql',
      sql: buildEquipmentDetailSql(['end_of_life', 'router_type'], filterCtx, {
        eolYear: yearOnly ? new Date().getFullYear() : null,
      }),
    };
  }

  return null;
}
