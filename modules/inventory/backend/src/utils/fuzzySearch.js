import db from '../db/index.js';

function territoryExpr(alias) {
  if (!alias) return `COALESCE(NULLIF(TRIM(territory), ''), area)`;
  return `COALESCE(NULLIF(TRIM(${alias}.territory), ''), ${alias}.area)`;
}

/**
 * @param {string} identifier
 * @returns {Promise<object | null>}
 */
export async function fuzzySearchSite(identifier) {
  if (!identifier || !String(identifier).trim()) return null;
  const raw = String(identifier).trim();
  const low = raw.toLowerCase();

  let site = await db
    .prepare(
      `SELECT * FROM sites
       WHERE name = ? OR plaid = ? OR LOWER(name) = ? OR LOWER(plaid) = ?
          OR ${territoryExpr()} = ? OR LOWER(${territoryExpr()}) = LOWER(?)`,
    )
    .get(raw, raw, low, low, raw, raw);

  if (site) return site;

  try {
    const token = raw.replace(/"/g, '""').replace(/\s+/g, ' ');
    const match = token.includes(' ') ? token.split(' ').map((t) => `"${t}"*`).join(' OR ') : `"${token}"*`;
    const rows = await db.prepare(`SELECT rowid FROM sites_fts WHERE sites_fts MATCH ? LIMIT 5`).all(match);
    if (rows.length > 0) {
      site = await db.prepare('SELECT * FROM sites WHERE rowid = ?').get(rows[0].rowid);
      if (site) return site;
    }
  } catch {
    /* FTS not ready or bad MATCH */
  }

  site = await db
    .prepare(
      `SELECT * FROM sites
       WHERE LOWER(name) LIKE ? OR LOWER(plaid) LIKE ? OR LOWER(${territoryExpr()}) LIKE ?
       LIMIT 1`,
    )
    .get(`%${low}%`, `%${low}%`, `%${low}%`);

  return site || null;
}

/**
 * @param {string} searchTerm
 * @returns {Promise<object[]>}
 */
export async function fuzzySearchEquipment(searchTerm) {
  if (!searchTerm || !String(searchTerm).trim()) return [];
  const q = `%${String(searchTerm).trim().toLowerCase()}%`;
  return await db
    .prepare(
      `SELECT e.*, s.name AS site_name
       FROM equipment e
       JOIN sites s ON e.site_id = s.id
       WHERE LOWER(e.vendor) LIKE ? OR LOWER(e.model) LIKE ? OR LOWER(e.serial_number) LIKE ?
          OR LOWER(COALESCE(e.router_type, '')) LIKE ?
       LIMIT 20`,
    )
    .all(q, q, q, q);
}
