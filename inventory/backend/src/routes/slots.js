import { Router } from 'express';
import db from '../db/index.js';
import { newId } from '../utils/helpers.js';

const router = Router();

router.post('/', (req, res) => {
  const { equipment_id, slot_name, total_ports } = req.body || {};
  if (!equipment_id || !slot_name) {
    return res.status(400).json({ error: 'equipment_id and slot_name are required' });
  }
  const n = Number(total_ports);
  if (!Number.isInteger(n) || n < 1) {
    return res.status(400).json({ error: 'total_ports must be an integer greater than 0' });
  }

  const eq = db.prepare('SELECT id FROM equipment WHERE id = ?').get(equipment_id);
  if (!eq) return res.status(400).json({ error: 'Invalid equipment_id' });

  const slotId = newId();
  const insertSlot = db.prepare(
    `INSERT INTO slots (id, equipment_id, slot_name, total_ports) VALUES (?, ?, ?, ?)`
  );
  const insertPort = db.prepare(
    `INSERT INTO ports (id, slot_id, port_number, is_utilized, description)
     VALUES (?, ?, ?, 0, '')`
  );

  try {
    db.exec('BEGIN IMMEDIATE');
    insertSlot.run(slotId, equipment_id, slot_name, n);
    for (let i = 1; i <= n; i++) {
      insertPort.run(newId(), slotId, i);
    }
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    return res.status(400).json({ error: e.message || 'Failed to create slot' });
  }

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  const ports = db
    .prepare('SELECT * FROM ports WHERE slot_id = ? ORDER BY port_number')
    .all(slotId)
    .map((p) => ({ ...p, is_utilized: Boolean(p.is_utilized) }));

  res.status(201).json({ slot, ports });
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Slot not found' });
  res.status(204).send();
});

export default router;
