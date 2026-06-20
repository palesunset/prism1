import { Router } from 'express';
import multer from 'multer';
import db, { runWithFtsRecovery } from '../db/index.js';
import { newId, isUniqueConstraintError, parseSiteCsvRow, normalizeSiteRowForInsert, normalizeSiteName } from '../utils/helpers.js';
import { processCombinedImport } from '../utils/combinedImport.js';
import { parseUploadCsvBuffer } from '../utils/csvUpload.js';
import { csvUploadFileFilter, getRateLimiters, escapeCsvCell } from '../middleware/security.js';

const router = Router();
const uploadLimiter = getRateLimiters().upload;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: csvUploadFileFilter,
});
function siteEquipmentRouterTypes(siteId) {
  const rows = db
    .prepare(
      `SELECT DISTINCT TRIM(router_type) AS router_type
       FROM equipment
       WHERE site_id = ?
         AND router_type IS NOT NULL
         AND TRIM(router_type) != ''
       ORDER BY router_type`
    )
    .all(siteId);
  const types = rows.map((r) => r.router_type).filter(Boolean);
  return types.length ? types.join(',') : null;
}

function equipmentStatsForSite(siteId, vendor) {
  const v = (vendor || '').toString().trim();
  const hasVendor = v.length > 0;
  // Joining bays and ports in one rowset multiplies rows (each port × each bay). Use DISTINCT on
  // port ids so totals/utilized counts stay correct; slot_count remains chassis bay rows (b.id).
  const row =
    db
      .prepare(
        `
    SELECT
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
    WHERE e.site_id = ?
      ${hasVendor ? 'AND LOWER(TRIM(e.vendor)) = LOWER(TRIM(?))' : ''}
  `
      )
      .get(...(hasVendor ? [siteId, v] : [siteId])) || {};
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

function siteTerritoryValue(s) {
  const t = (s.territory || '').toString().trim();
  if (t) return t;
  return (s.area || '').toString();
}

router.get('/', (req, res) => {
  const q = (req.query.q || req.query.search || '').toString().trim().toLowerCase();
  const vendor = (req.query.vendor || '').toString().trim();
  const territory = (req.query.territory || '').toString().trim();
  const region = (req.query.region || '').toString().trim();

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

  let sites = db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM equipment e WHERE e.site_id = s.id) AS equipment_count
       FROM sites s
       ${whereClause}
       ORDER BY s.name`
    )
    .all(...sqlParams);

  if (q) {
    sites = sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.plaid.toLowerCase().includes(q) ||
        siteTerritoryValue(s).toLowerCase().includes(q) ||
        s.area.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
  }

  const withStats = sites.map((s) => {
    const stats = equipmentStatsForSite(s.id, vendor);
    return {
      ...s,
      equipment_count: stats.equipment_count,
      total_ports: stats.total_ports,
      utilized_ports: stats.utilized_ports,
      utilization_pct: stats.utilization_pct,
      equipment_router_types: siteEquipmentRouterTypes(s.id),
    };
  });

  res.json(withStats);
});

router.get('/territories', (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(territory), ''), area) AS t
       FROM sites
       WHERE COALESCE(NULLIF(TRIM(territory), ''), area) IS NOT NULL
         AND TRIM(COALESCE(NULLIF(TRIM(territory), ''), area)) != ''
       ORDER BY t`
    )
    .all();
  res.json(rows.map((r) => r.t));
});

router.get('/regions', (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT region FROM sites WHERE region IS NOT NULL AND TRIM(region) != '' ORDER BY region`
    )
    .all();
  res.json(rows.map((r) => r.region));
});

router.post('/', (req, res) => {
  const { name, plaid, area, territory, region, address, lat, lng } = req.body || {};
  const territoryVal = (territory != null && String(territory).trim() !== '' ? String(territory).trim() : null) || area;
  const nameNorm = normalizeSiteName(name);
  if (!nameNorm || !plaid || !territoryVal || !region) {
    return res.status(400).json({ error: 'name, plaid, territory (or area), and region are required' });
  }
  const latN = lat !== undefined && lat !== '' ? Number(lat) : null;
  const lngN = lng !== undefined && lng !== '' ? Number(lng) : null;
  if (latN !== null && (Number.isNaN(latN) || latN < -90 || latN > 90)) {
    return res.status(400).json({ error: 'lat must be between -90 and 90' });
  }
  if (lngN !== null && (Number.isNaN(lngN) || lngN < -180 || lngN > 180)) {
    return res.status(400).json({ error: 'lng must be between -180 and 180' });
  }
  const id = newId();
  try {
    db.prepare(
      `INSERT INTO sites (id, name, plaid, area, territory, region, address, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, nameNorm, plaid, territoryVal, territoryVal, region, address ?? null, latN, lngN);
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return res.status(400).json({ error: 'PLAID must be unique' });
    }
    throw e;
  }
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  res.status(201).json(site);
});

router.post('/import', uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'CSV file is required (field name: file)' });
  }

  const existing = db.prepare('SELECT id, plaid FROM sites').all();
  const existingPlaids = new Set(existing.map((r) => r.plaid));
  const existingByPlaid = new Map(existing.map((r) => [r.plaid, r]));

  const rows = await parseUploadCsvBuffer(req.file.buffer);

  let added = 0;
  const errors = [];
  const batchPlaids = new Set();

  for (let i = 0; i < rows.length; i++) {
    const line = i + 2;
    const parsed = parseSiteCsvRow(rows[i]);
    const norm = normalizeSiteRowForInsert(parsed);
    if (norm.error) {
      errors.push({ line, message: norm.error });
      continue;
    }

    const existingRow = existingByPlaid.get(norm.plaid);
    if (existingRow) {
      errors.push({ line, message: `Duplicate PLAID: ${norm.plaid}` });
      continue;
    }

    if (batchPlaids.has(norm.plaid) || existingPlaids.has(norm.plaid)) {
      errors.push({ line, message: `Duplicate PLAID: ${norm.plaid}` });
      continue;
    }

    batchPlaids.add(norm.plaid);
    const id = newId();
    try {
      db.prepare(
        `INSERT INTO sites (id, name, plaid, area, territory, region, address, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        norm.name,
        norm.plaid,
        norm.area,
        norm.area,
        norm.region,
        norm.address ?? null,
        norm.lat,
        norm.lng
      );
      existingPlaids.add(norm.plaid);
      existingByPlaid.set(norm.plaid, { id, plaid: norm.plaid });
      added++;
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        errors.push({ line, message: `Duplicate PLAID: ${norm.plaid}` });
      } else {
        errors.push({ line, message: e.message || 'Insert failed' });
      }
    }
  }

  res.json({
    success: errors.length === 0,
    added,
    skipped: errors.length,
    errors,
  });
});

router.post('/import/combined', uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'CSV file is required (field name: file)' });
  }

  const rows = await parseUploadCsvBuffer(req.file.buffer);

  const result = processCombinedImport(rows);
  res.json(result);
});

router.get('/summary', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const vendor = (req.query.vendor || '').toString().trim();
  let sites = db.prepare('SELECT * FROM sites ORDER BY name').all();
  if (q) {
    sites = sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.plaid.toLowerCase().includes(q) ||
        siteTerritoryValue(s).toLowerCase().includes(q) ||
        s.area.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
  }
  const rows = sites.map((s) => {
    const stats = equipmentStatsForSite(s.id, vendor);
    return {
      id: s.id,
      name: s.name,
      plaid: s.plaid,
      area: s.area,
      region: s.region,
      address: s.address,
      equipment_count: stats.equipment_count,
      total_ports: stats.total_ports,
      utilized_ports: stats.utilized_ports,
      utilization_pct: stats.utilization_pct,
      equipment_router_types: siteEquipmentRouterTypes(s.id),
    };
  });
  res.json(rows);
});

router.get('/:id/export', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  const vendor = (req.query.vendor || '').toString().trim();
  const v = vendor;
  const hasVendor = v.length > 0;

  const rows = db
    .prepare(
      `
    SELECT e.*,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM equipment e
    LEFT JOIN slots s ON s.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = s.id
    WHERE e.site_id = ?
      ${hasVendor ? 'AND LOWER(TRIM(e.vendor)) = LOWER(TRIM(?))' : ''}
    GROUP BY e.id
    ORDER BY e.vendor, e.model
  `
    )
    .all(...(hasVendor ? [site.id, v] : [site.id]));

  const header = [
    'Vendor',
    'Network Element',
    'Model',
    'Serial Number',
    'IP Address',
    'Software Version',
    'Descriptor Version',
    'Status',
    'Rack Position',
    'End of Life',
    'Total Ports',
    'Utilized Ports',
    'Free Ports',
    'Utilization %',
  ];
  const lines = [header.join(',')];
  for (const e of rows) {
    const total = e.total_ports || 0;
    const used = e.utilized_ports || 0;
    const free = total - used;
    const pct = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';
    lines.push(
      [
        escapeCsvCell(e.vendor),
        escapeCsvCell(
          e.network_element != null && String(e.network_element).trim() !== ''
            ? e.network_element
            : e.model
        ),
        escapeCsvCell(e.model),
        escapeCsvCell(e.serial_number),
        escapeCsvCell(e.ip_address),
        escapeCsvCell(e.software_version),
        escapeCsvCell(e.descriptor_version),
        escapeCsvCell(e.status),
        escapeCsvCell(e.rack_position),
        escapeCsvCell(e.end_of_life),
        total,
        used,
        free,
        pct,
      ].join(',')
    );
  }

  const csv = lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const suffix = hasVendor ? `-${v.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40)}` : '';
  res.setHeader('Content-Disposition', `attachment; filename="site-${site.plaid}${suffix}-equipment.csv"`);
  res.send(csv);
});

router.get('/:id', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  const vendor = (req.query.vendor || '').toString().trim();

  const equipment = db
    .prepare(
      `
    SELECT e.*,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM equipment e
    LEFT JOIN slots s ON s.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = s.id
    WHERE e.site_id = ?
    GROUP BY e.id
    ORDER BY e.vendor, e.model
  `
    )
    .all(site.id);

  const eqMapped = equipment.map((e) => {
    const total = e.total_ports || 0;
    const used = e.utilized_ports || 0;
    const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
    const { total_ports, utilized_ports, ...rest } = e;
    return {
      ...rest,
      total_ports: total,
      utilized_ports: used,
      free_ports: total - used,
      utilization_pct: pct,
    };
  });

  const siteStats = equipmentStatsForSite(site.id, vendor);
  res.json({
    site,
    equipment: eqMapped,
    summary: siteStats,
  });
});

router.patch('/:id', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const { name, plaid, area, territory, region, address, lat, lng } = req.body || {};
  const updates = [];
  const vals = [];

  if (name !== undefined) {
    updates.push('name = ?');
    vals.push(normalizeSiteName(name));
  }
  if (plaid !== undefined) {
    updates.push('plaid = ?');
    vals.push(plaid);
  }
  if (territory !== undefined && area !== undefined) {
    const tv = territory === '' || territory == null ? '' : String(territory).trim();
    const av = area === '' || area == null ? '' : String(area).trim();
    updates.push('territory = ?', 'area = ?');
    vals.push(tv, av);
  } else if (territory !== undefined) {
    const tv = territory === '' || territory == null ? '' : String(territory).trim();
    updates.push('territory = ?', 'area = ?');
    vals.push(tv, tv);
  } else if (area !== undefined) {
    const av = area === '' || area == null ? '' : String(area).trim();
    updates.push('area = ?', 'territory = ?');
    vals.push(av, av);
  }
  if (region !== undefined) {
    updates.push('region = ?');
    vals.push(region);
  }
  if (address !== undefined) {
    updates.push('address = ?');
    vals.push(address);
  }
  if (lat !== undefined) {
    const latN = lat === '' || lat === null ? null : Number(lat);
    if (latN !== null && (Number.isNaN(latN) || latN < -90 || latN > 90)) {
      return res.status(400).json({ error: 'lat must be between -90 and 90' });
    }
    updates.push('lat = ?');
    vals.push(latN);
  }
  if (lng !== undefined) {
    const lngN = lng === '' || lng === null ? null : Number(lng);
    if (lngN !== null && (Number.isNaN(lngN) || lngN < -180 || lngN > 180)) {
      return res.status(400).json({ error: 'lng must be between -180 and 180' });
    }
    updates.push('lng = ?');
    vals.push(lngN);
  }
  if (updates.length === 0) {
    return res.json(site);
  }

  updates.push("updated_at = datetime('now')");
  vals.push(req.params.id);

  try {
    db.prepare(`UPDATE sites SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return res.status(400).json({ error: 'PLAID must be unique' });
    }
    throw e;
  }

  const updated = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const r = runWithFtsRecovery(() => db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Site not found' });
  res.status(204).send();
});

export default router;
