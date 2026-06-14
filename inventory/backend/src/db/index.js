import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'inventory.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

function ensureColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
  return cols.includes(column);
}

db.exec(`
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plaid TEXT UNIQUE NOT NULL,
  area TEXT NOT NULL,
  region TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  end_of_life TEXT,
  status TEXT DEFAULT 'Active',
  rack_position TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_site_serial ON equipment(site_id, serial_number);

CREATE TABLE IF NOT EXISTS equipment_bays (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  label TEXT DEFAULT '',
  is_utilized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(equipment_id, slot_index)
);

CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  slot_name TEXT NOT NULL,
  total_ports INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ports (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  port_number INTEGER NOT NULL,
  is_utilized INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(slot_id, port_number)
);
`);

if (!ensureColumn('equipment', 'chassis_slot_count')) {
  db.exec(`ALTER TABLE equipment ADD COLUMN chassis_slot_count INTEGER`);
}

if (!ensureColumn('equipment', 'ip_address')) {
  db.exec(`ALTER TABLE equipment ADD COLUMN ip_address TEXT`);
}

if (!ensureColumn('equipment', 'router_type')) {
  db.exec(`ALTER TABLE equipment ADD COLUMN router_type TEXT`);
}

if (!ensureColumn('equipment', 'network_element')) {
  db.exec(`ALTER TABLE equipment ADD COLUMN network_element TEXT`);
  try {
    db.exec(
      `UPDATE equipment SET network_element = model WHERE network_element IS NULL OR TRIM(COALESCE(network_element, '')) = ''`
    );
  } catch {
    /* ignore */
  }
}

if (!ensureColumn('equipment', 'software_version')) {
  db.exec(`ALTER TABLE equipment ADD COLUMN software_version TEXT`);
}

if (!ensureColumn('equipment', 'descriptor_version')) {
  db.exec(`ALTER TABLE equipment ADD COLUMN descriptor_version TEXT`);
}

if (!ensureColumn('sites', 'router_type')) {
  db.exec(`ALTER TABLE sites ADD COLUMN router_type TEXT`);
}

if (!ensureColumn('sites', 'router_types')) {
  db.exec(`ALTER TABLE sites ADD COLUMN router_types TEXT`);
}

if (!ensureColumn('sites', 'territory')) {
  db.exec(`ALTER TABLE sites ADD COLUMN territory TEXT`);
  try {
    db.exec(
      `UPDATE sites SET territory = area WHERE territory IS NULL OR TRIM(COALESCE(territory, '')) = ''`
    );
  } catch {
    /* ignore */
  }
}

/** Oz / FTS5: typo-tolerant search (external content + triggers). */
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS sites_fts USING fts5(
      name, plaid, territory, region, address,
      content='sites', content_rowid='rowid'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS equipment_fts USING fts5(
      vendor, model, serial_number, router_type,
      content='equipment', content_rowid='rowid'
    );
  `);
  const sitesFts = db.prepare(`SELECT COUNT(*) AS c FROM sites_fts`).get();
  if ((sitesFts?.c ?? 0) === 0) {
    db.exec(`INSERT INTO sites_fts(sites_fts) VALUES('rebuild')`);
  }
  const eqFts = db.prepare(`SELECT COUNT(*) AS c FROM equipment_fts`).get();
  if ((eqFts?.c ?? 0) === 0) {
    db.exec(`INSERT INTO equipment_fts(equipment_fts) VALUES('rebuild')`);
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS sites_ai AFTER INSERT ON sites BEGIN
      INSERT INTO sites_fts(rowid, name, plaid, territory, region, address)
      VALUES (
        new.rowid, new.name, new.plaid,
        COALESCE(NULLIF(TRIM(new.territory), ''), new.area),
        new.region, COALESCE(new.address, '')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS sites_ad AFTER DELETE ON sites BEGIN
      INSERT INTO sites_fts(sites_fts, rowid, name, plaid, territory, region, address)
      VALUES ('delete', old.rowid, old.name, old.plaid,
        COALESCE(NULLIF(TRIM(old.territory), ''), old.area),
        old.region, COALESCE(old.address, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS sites_au AFTER UPDATE ON sites BEGIN
      INSERT INTO sites_fts(sites_fts, rowid, name, plaid, territory, region, address)
      VALUES ('delete', old.rowid, old.name, old.plaid,
        COALESCE(NULLIF(TRIM(old.territory), ''), old.area),
        old.region, COALESCE(old.address, ''));
      INSERT INTO sites_fts(rowid, name, plaid, territory, region, address)
      VALUES (
        new.rowid, new.name, new.plaid,
        COALESCE(NULLIF(TRIM(new.territory), ''), new.area),
        new.region, COALESCE(new.address, '')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS equipment_ai AFTER INSERT ON equipment BEGIN
      INSERT INTO equipment_fts(rowid, vendor, model, serial_number, router_type)
      VALUES (new.rowid, new.vendor, new.model, new.serial_number, COALESCE(new.router_type, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS equipment_ad AFTER DELETE ON equipment BEGIN
      INSERT INTO equipment_fts(equipment_fts, rowid, vendor, model, serial_number, router_type)
      VALUES ('delete', old.rowid, old.vendor, old.model, old.serial_number, COALESCE(old.router_type, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS equipment_au AFTER UPDATE ON equipment BEGIN
      INSERT INTO equipment_fts(equipment_fts, rowid, vendor, model, serial_number, router_type)
      VALUES ('delete', old.rowid, old.vendor, old.model, old.serial_number, COALESCE(old.router_type, ''));
      INSERT INTO equipment_fts(rowid, vendor, model, serial_number, router_type)
      VALUES (new.rowid, new.vendor, new.model, new.serial_number, COALESCE(new.router_type, ''));
    END;
  `);
} catch (e) {
  console.warn('FTS5 init skipped:', e?.message || e);
}

export default db;
