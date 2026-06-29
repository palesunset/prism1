import { Router } from 'express';
import db from '../db/index.js';
import { newId } from '../utils/helpers.js';
import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

function asInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

async function getEquipment(id) {
  return await db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
}

async function baysForEquipment(equipmentId) {
  return (await db
    .prepare(
      `SELECT id, equipment_id, slot_index, label, is_utilized, created_at, updated_at
       FROM equipment_bays
       WHERE equipment_id = ?
       ORDER BY slot_index`,
    )
    .all(equipmentId)).map((b) => ({ ...b, is_utilized: Boolean(b.is_utilized) }));
}

function baysSummary(bays) {
  const total = bays.length;
  const utilized = bays.reduce((a, b) => a + (b.is_utilized ? 1 : 0), 0);
  return { total, utilized, free: total - utilized };
}

async function initOrResizeBays(equipmentId, totalSlots) {
  const n = asInt(totalSlots);
  if (n == null || n < 0 || n > 10_000) {
    return { ok: false, error: 'total_slots must be an integer between 0 and 10000' };
  }

  const existing = await baysForEquipment(equipmentId);
  const current = existing.length;

  if (n === current) return { ok: true };

  if (n > current) {
    const insert = db.prepare(
      `INSERT INTO equipment_bays (id, equipment_id, slot_index, label, is_utilized, created_at, updated_at)
       VALUES (?, ?, ?, '', 0, datetime('now'), datetime('now'))`,
    );
    await db.exec('BEGIN IMMEDIATE');
    try {
      for (let idx = current + 1; idx <= n; idx++) {
        await insert.run(newId(), equipmentId, idx);
      }
      await db.prepare('UPDATE equipment SET chassis_slot_count = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
        n,
        equipmentId,
      );
      await db.exec('COMMIT');
      return { ok: true };
    } catch (e) {
      try {
        await db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      return { ok: false, error: e?.message || 'Failed to resize bays' };
    }
  }

  const toRemove = existing.filter((b) => b.slot_index > n);
  const utilizedInRemoved = toRemove.filter((b) => b.is_utilized);
  if (utilizedInRemoved.length) {
    const maxIdx = Math.max(...utilizedInRemoved.map((b) => b.slot_index));
    return {
      ok: false,
      error: `Cannot reduce to ${n}. Slot ${maxIdx} (and possibly others) is marked utilized. Uncheck utilized slots before shrinking.`,
    };
  }

  const del = db.prepare('DELETE FROM equipment_bays WHERE equipment_id = ? AND slot_index > ?');
  await db.exec('BEGIN IMMEDIATE');
  try {
    await del.run(equipmentId, n);
    await db.prepare('UPDATE equipment SET chassis_slot_count = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      n,
      equipmentId,
    );
    await db.exec('COMMIT');
    return { ok: true };
  } catch (e) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    return { ok: false, error: e?.message || 'Failed to resize bays' };
  }
}

router.post('/equipment/:id/bays/init', async (req, res) => {
  const equipmentId = req.params.id;
  const eq = await getEquipment(equipmentId);
  if (!eq) return res.status(404).json({ error: 'Equipment not found' });

  const n = req.body?.total_slots ?? req.body?.chassis_slot_count ?? req.body?.slots ?? null;
  const r = await initOrResizeBays(equipmentId, n);
  if (!r.ok) return res.status(400).json({ error: r.error });

  const bays = await baysForEquipment(equipmentId);
  return res.json({ equipment_id: equipmentId, bays, summary: baysSummary(bays) });
});

router.get('/equipment/:id/bays', async (req, res) => {
  const equipmentId = req.params.id;
  const eq = await getEquipment(equipmentId);
  if (!eq) return res.status(404).json({ error: 'Equipment not found' });
  const bays = await baysForEquipment(equipmentId);
  return res.json({ equipment_id: equipmentId, bays, summary: baysSummary(bays) });
});

router.patch('/equipment/:id/bays/resize', async (req, res) => {
  const equipmentId = req.params.id;
  const eq = await getEquipment(equipmentId);
  if (!eq) return res.status(404).json({ error: 'Equipment not found' });

  const r = await initOrResizeBays(equipmentId, req.body?.total_slots);
  if (!r.ok) return res.status(400).json({ error: r.error });

  const bays = await baysForEquipment(equipmentId);
  return res.json({ equipment_id: equipmentId, bays, summary: baysSummary(bays) });
});

router.patch('/equipment-bays/:bayId', async (req, res) => {
  const bayId = req.params.bayId;
  const bay = await db.prepare('SELECT * FROM equipment_bays WHERE id = ?').get(bayId);
  if (!bay) return res.status(404).json({ error: 'Bay not found' });

  const label = req.body?.label;
  const isUtilizedRaw = req.body?.is_utilized;
  const sets = [];
  const params = [];

  if (label !== undefined) {
    sets.push('label = ?');
    params.push(String(label));
  }
  if (isUtilizedRaw !== undefined) {
    sets.push('is_utilized = ?');
    params.push(isUtilizedRaw ? 1 : 0);
  }
  if (!sets.length) return res.status(400).json({ error: 'No changes provided' });

  sets.push("updated_at = datetime('now')");
  params.push(bayId);

  await db.prepare(`UPDATE equipment_bays SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = await db.prepare('SELECT * FROM equipment_bays WHERE id = ?').get(bayId);
  res.json({ ...updated, is_utilized: Boolean(updated.is_utilized) });
});

promisifyRouter(router);

export default router;
