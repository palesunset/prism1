import path from "path";
import { fileURLToPath } from "url";
import { createPrismDb, isPostgresMode } from "prism-db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "..", "inventory.db");

/** Runs on raw node:sqlite DatabaseSync during local init only. */
function initSqliteSchema(db) {
  db.exec("PRAGMA foreign_keys = ON");

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

  for (const [table, col, ddl] of [
    ["equipment", "chassis_slot_count", "INTEGER"],
    ["equipment", "ip_address", "TEXT"],
    ["equipment", "router_type", "TEXT"],
    ["equipment", "network_element", "TEXT"],
    ["equipment", "software_version", "TEXT"],
    ["equipment", "descriptor_version", "TEXT"],
    ["sites", "router_type", "TEXT"],
    ["sites", "router_types", "TEXT"],
    ["sites", "territory", "TEXT"],
  ]) {
    if (!ensureColumn(table, col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
    }
  }

  try {
    db.exec(
      `UPDATE equipment SET network_element = model WHERE network_element IS NULL OR TRIM(COALESCE(network_element, '')) = ''`,
    );
  } catch {
    /* ignore */
  }
  try {
    db.exec(
      `UPDATE sites SET territory = area WHERE territory IS NULL OR TRIM(COALESCE(territory, '')) = ''`,
    );
  } catch {
    /* ignore */
  }
  try {
    db.exec(`UPDATE sites SET name = UPPER(name) WHERE name IS NOT NULL AND name != UPPER(name)`);
  } catch {
    /* ignore */
  }

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
    const siteCount = db.prepare("SELECT COUNT(*) AS c FROM sites").get()?.c ?? 0;
    const sitesFtsCount = db.prepare("SELECT COUNT(*) AS c FROM sites_fts").get()?.c ?? 0;
    if (siteCount !== sitesFtsCount) {
      db.exec(`INSERT INTO sites_fts(sites_fts) VALUES('rebuild')`);
    }
    const eqCount = db.prepare("SELECT COUNT(*) AS c FROM equipment").get()?.c ?? 0;
    const eqFtsCount = db.prepare("SELECT COUNT(*) AS c FROM equipment_fts").get()?.c ?? 0;
    if (eqCount !== eqFtsCount) {
      db.exec(`INSERT INTO equipment_fts(equipment_fts) VALUES('rebuild')`);
    }
  } catch (e) {
    console.warn("FTS5 init skipped:", e?.message || e);
  }
}

const { db, dialect } = createPrismDb({ sqlitePath: dbPath, sqliteInit: initSqliteSchema });

export function isFtsMaintenanceError(e) {
  const msg = String(e?.message || "");
  return /malformed|SQLITE_CORRUPT|fts5/i.test(msg);
}

export async function rebuildSitesFts() {
  if (dialect !== "sqlite") return;
  await db.exec(`INSERT INTO sites_fts(sites_fts) VALUES('rebuild')`);
}

export async function rebuildEquipmentFts() {
  if (dialect !== "sqlite") return;
  await db.exec(`INSERT INTO equipment_fts(equipment_fts) VALUES('rebuild')`);
}

export async function ensureFtsInSync(activeDb = db) {
  if (dialect !== "sqlite") return;
  const siteCount = (await activeDb.prepare("SELECT COUNT(*) AS c FROM sites").get())?.c ?? 0;
  const sitesFtsCount = (await activeDb.prepare("SELECT COUNT(*) AS c FROM sites_fts").get())?.c ?? 0;
  if (siteCount !== sitesFtsCount) await rebuildSitesFts();

  const eqCount = (await activeDb.prepare("SELECT COUNT(*) AS c FROM equipment").get())?.c ?? 0;
  const eqFtsCount = (await activeDb.prepare("SELECT COUNT(*) AS c FROM equipment_fts").get())?.c ?? 0;
  if (eqCount !== eqFtsCount) await rebuildEquipmentFts();
}

export async function runWithFtsRecovery(fn) {
  if (dialect !== "sqlite") return await fn();
  try {
    return await fn();
  } catch (e) {
    if (!isFtsMaintenanceError(e)) throw e;
    console.warn("FTS maintenance: rebuilding indexes after write error:", e.message);
    await rebuildSitesFts();
    await rebuildEquipmentFts();
    return await fn();
  }
}

export default db;
export { dialect as dbDialect, isPostgresMode };
