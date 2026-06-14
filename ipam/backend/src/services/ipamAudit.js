import { randomUUID } from 'node:crypto';
import db from '../db/index.js';

db.exec(`
CREATE TABLE IF NOT EXISTS ip_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  record_id TEXT,
  address TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ip_audit_created ON ip_audit(created_at DESC);
`);

export function logAudit(action, recordId, address, details = {}) {
  db.prepare(
    `INSERT INTO ip_audit (id, action, record_id, address, details) VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), action, recordId ?? null, address ?? null, JSON.stringify(details));
}

export function listAudit(limit = 100) {
  const rows = db
    .prepare(`SELECT * FROM ip_audit ORDER BY created_at DESC LIMIT ?`)
    .all(Math.min(limit, 500));
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    record_id: row.record_id,
    address: row.address,
    details: row.details ? JSON.parse(row.details) : {},
    created_at: row.created_at,
  }));
}
