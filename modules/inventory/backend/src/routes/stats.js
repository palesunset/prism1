import { Router } from 'express';
import db from '../db/index.js';
import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

function parseSiteIds(raw) {
  const s = (raw || '').toString().trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

router.get('/stats', async (req, res) => {
  const siteIds = parseSiteIds(req.query.site_ids);
  if (!siteIds.length) {
    return res.json({
      scope: 'all',
      site_count: 0,
      equipment_count: 0,
      slot_count: 0,
      utilized_slot_count: 0,
      free_slot_count: 0,
    });
  }

  const ph = siteIds.map(() => '?').join(',');
  const row = await db
    .prepare(
      `
    SELECT
      COUNT(DISTINCT s.id) AS site_count,
      COUNT(DISTINCT e.id) AS equipment_count,
      COUNT(DISTINCT sl.id) AS slot_count,
      COUNT(DISTINCT CASE WHEN sp.used_ports > 0 THEN sl.id END) AS utilized_slot_count
    FROM sites s
    LEFT JOIN equipment e ON e.site_id = s.id
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN (
      SELECT
        p.slot_id AS slot_id,
        COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS used_ports
      FROM ports p
      GROUP BY p.slot_id
    ) sp ON sp.slot_id = sl.id
    WHERE s.id IN (${ph})
  `,
    )
    .get(...siteIds);

  const slotCount = row.slot_count || 0;
  const utilizedSlots = row.utilized_slot_count || 0;
  const freeSlots = slotCount - utilizedSlots;

  res.json({
    scope: 'site_ids',
    site_ids: siteIds,
    site_count: row.site_count || 0,
    equipment_count: row.equipment_count || 0,
    slot_count: slotCount,
    utilized_slot_count: utilizedSlots,
    free_slot_count: freeSlots,
  });
});

promisifyRouter(router);

export default router;
