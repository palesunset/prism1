import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.IPAM_DB_PATH || path.join(__dirname, '..', '..', 'ipam.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS ip_records (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK(record_type IN ('host', 'subnet')),
  status TEXT NOT NULL DEFAULT 'used' CHECK(status IN ('free', 'used', 'reserved')),
  project TEXT DEFAULT '',
  vlan TEXT,
  location TEXT,
  description TEXT,
  cidr_prefix INTEGER,
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ip_records_range ON ip_records(range_start, range_end);
CREATE INDEX IF NOT EXISTS idx_ip_records_status ON ip_records(status);
CREATE INDEX IF NOT EXISTS idx_ip_records_type ON ip_records(record_type);
CREATE INDEX IF NOT EXISTS idx_ip_records_project ON ip_records(project);

CREATE TABLE IF NOT EXISTS ip_workflows (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK(record_type IN ('host', 'subnet')),
  project TEXT DEFAULT '',
  location TEXT,
  vlan TEXT,
  description TEXT,
  requester TEXT DEFAULT 'user',
  state TEXT NOT NULL DEFAULT 'REQUESTED',
  netlens_result TEXT,
  ipam_record_id TEXT,
  override_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ip_workflows_state ON ip_workflows(state);
CREATE INDEX IF NOT EXISTS idx_ip_workflows_updated ON ip_workflows(updated_at);

CREATE TABLE IF NOT EXISTS ip_workflow_log (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT DEFAULT 'user',
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ip_workflow_log_workflow ON ip_workflow_log(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ip_workflow_log_created ON ip_workflow_log(created_at);
`);

try {
  db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_records_unique_v4_host ON ip_records(range_start) WHERE record_type = 'host' AND address_family = 'ipv4';
`);
} catch {
  /* index may fail if duplicates already exist */
}

runMigrations(db);

export default db;
