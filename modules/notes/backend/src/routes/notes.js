import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

function parseItems(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rowToNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    owner: row.owner,
    title: row.title ?? '',
    content: row.content,
    items: parseItems(row.items),
    note_type: row.note_type ?? 'note',
    color: row.color,
    label: row.label,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    due_date: row.due_date,
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function touchNote(id, fields) {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(value);
  }
  sets.push("updated_at = datetime('now')");
  values.push(id);
  await db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'prism-notes' });
});

router.get('/', async (req, res) => {
  const archived = req.query.archived === 'true' ? 1 : req.query.archived === 'false' ? 0 : 0;
  const rows = await db
    .prepare(
      `SELECT * FROM notes
       WHERE archived = ?
       ORDER BY pinned DESC, sort_order ASC, updated_at DESC`,
    )
    .all(archived);
  res.json({ notes: rows.map(rowToNote) });
});

router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const id = randomUUID();
  const items = body.items != null ? JSON.stringify(body.items) : null;
  await db.prepare(
    `INSERT INTO notes (id, title, content, items, note_type, color, label, pinned, archived, due_date, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    String(body.title ?? ''),
    body.content ?? null,
    items,
    body.note_type ?? 'note',
    body.color ?? null,
    body.label ?? null,
    body.pinned ? 1 : 0,
    body.due_date ?? null,
    Number.isFinite(body.sort_order) ? body.sort_order : 0,
  );
  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  res.status(201).json(rowToNote(row));
});

router.get('/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ detail: 'Note not found' });
    return;
  }
  res.json(rowToNote(row));
});

router.put('/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ detail: 'Note not found' });
    return;
  }
  const body = req.body ?? {};
  const fields = {};
  if (body.title !== undefined) fields.title = String(body.title);
  if (body.content !== undefined) fields.content = body.content;
  if (body.items !== undefined) fields.items = body.items == null ? null : JSON.stringify(body.items);
  if (body.note_type !== undefined) fields.note_type = body.note_type;
  if (body.color !== undefined) fields.color = body.color;
  if (body.label !== undefined) fields.label = body.label;
  if (body.pinned !== undefined) fields.pinned = body.pinned ? 1 : 0;
  if (body.archived !== undefined) fields.archived = body.archived ? 1 : 0;
  if (body.due_date !== undefined) fields.due_date = body.due_date;
  if (body.sort_order !== undefined) fields.sort_order = body.sort_order;
  await touchNote(req.params.id, fields);
  const updated = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(rowToNote(updated));
});

router.delete('/:id', async (req, res) => {
  const result = await db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ detail: 'Note not found' });
    return;
  }
  res.status(204).send();
});

router.post('/:id/pin', async (req, res) => {
  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ detail: 'Note not found' });
    return;
  }
  await touchNote(req.params.id, { pinned: row.pinned ? 0 : 1 });
  const updated = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(rowToNote(updated));
});

router.post('/:id/archive', async (req, res) => {
  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ detail: 'Note not found' });
    return;
  }
  await touchNote(req.params.id, { archived: row.archived ? 0 : 1 });
  const updated = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(rowToNote(updated));
});

router.post('/:id/items/:index/toggle', async (req, res) => {
  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ detail: 'Note not found' });
    return;
  }
  const items = parseItems(row.items) ?? [];
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    res.status(400).json({ detail: 'Invalid checklist index' });
    return;
  }
  items[index] = { ...items[index], done: !items[index]?.done };
  await touchNote(req.params.id, { items: JSON.stringify(items) });
  const updated = await db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(rowToNote(updated));
});

promisifyRouter(router);

export default router;
