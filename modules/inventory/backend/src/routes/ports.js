import { Router } from 'express';
import db from '../db/index.js';
import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

router.patch('/:id', async (req, res) => {
  const port = await db.prepare('SELECT * FROM ports WHERE id = ?').get(req.params.id);
  if (!port) return res.status(404).json({ error: 'Port not found' });

  const { is_utilized, description } = req.body || {};
  const updates = [];
  const vals = [];

  if (is_utilized !== undefined) {
    updates.push('is_utilized = ?');
    vals.push(is_utilized ? 1 : 0);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    vals.push(String(description));
  }

  if (updates.length === 0) {
    return res.json({ ...port, is_utilized: Boolean(port.is_utilized) });
  }

  updates.push("updated_at = datetime('now')");
  vals.push(req.params.id);

  await db.prepare(`UPDATE ports SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  const updated = await db.prepare('SELECT * FROM ports WHERE id = ?').get(req.params.id);
  res.json({ ...updated, is_utilized: Boolean(updated.is_utilized) });
});

promisifyRouter(router);

export default router;
