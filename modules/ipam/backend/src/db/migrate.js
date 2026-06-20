export const SCHEMA_VERSION = 5;

function migrateToV5(db) {
  if (!columnExists(db, 'ip_records', 'address_family')) {
    db.exec(`ALTER TABLE ip_records ADD COLUMN address_family TEXT NOT NULL DEFAULT 'ipv4'`);
  }
  if (!columnExists(db, 'ip_records', 'v6_range_start')) {
    db.exec(`ALTER TABLE ip_records ADD COLUMN v6_range_start TEXT`);
  }
  if (!columnExists(db, 'ip_records', 'v6_range_end')) {
    db.exec(`ALTER TABLE ip_records ADD COLUMN v6_range_end TEXT`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ip_records_family ON ip_records(address_family)`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_records_unique_v6_host
    ON ip_records(v6_range_start)
    WHERE record_type = 'host' AND address_family = 'ipv6'
  `);
}

/** IPv6 hosts store range_start=0; the legacy host index must be IPv4-only. */
function fixHostUniqueIndexes(db) {
  db.exec(`DROP INDEX IF EXISTS idx_ip_records_unique_host`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_records_unique_v4_host
    ON ip_records(range_start)
    WHERE record_type = 'host' AND address_family = 'ipv4'
  `);
}

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function migrateToV2(db) {
  const extraCols = [
    'hostname',
    'mac_address',
    'gateway',
    'dhcp_scope',
    'ptr_record',
    'parent_subnet_id',
  ];
  for (const col of extraCols) {
    if (!columnExists(db, 'ip_records', col)) {
      db.exec(`ALTER TABLE ip_records ADD COLUMN ${col} TEXT`);
    }
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_ip_records_parent ON ip_records(parent_subnet_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ip_records_hostname ON ip_records(hostname)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.prepare(`INSERT OR IGNORE INTO ip_settings (key, value) VALUES ('utilization_alert_percent', '80')`).run();

  if (!columnExists(db, 'ip_workflows', 'rejected_reason')) {
    db.exec(`ALTER TABLE ip_workflows ADD COLUMN rejected_reason TEXT`);
  }

  db.exec('PRAGMA foreign_keys = ON');
}

function migrateToV4(db) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='ip_records'`).get();
  if (row?.sql?.includes('REFERENCES ip_records')) {
    return;
  }

  db.exec(`
    UPDATE ip_records SET parent_subnet_id = NULL
    WHERE parent_subnet_id IS NOT NULL
      AND parent_subnet_id NOT IN (SELECT id FROM ip_records WHERE record_type = 'subnet')
  `);

  db.exec(`
    CREATE TABLE ip_records_new (
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
      hostname TEXT,
      mac_address TEXT,
      gateway TEXT,
      dhcp_scope TEXT,
      ptr_record TEXT,
      parent_subnet_id TEXT REFERENCES ip_records(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO ip_records_new (
      id, address, record_type, status, project, vlan, location, description,
      cidr_prefix, range_start, range_end, hostname, mac_address, gateway,
      dhcp_scope, ptr_record, parent_subnet_id, created_at, updated_at
    )
    SELECT
      id, address, record_type, status, project, vlan, location, description,
      cidr_prefix, range_start, range_end, hostname, mac_address, gateway,
      dhcp_scope, ptr_record, parent_subnet_id, created_at, updated_at
    FROM ip_records;

    DROP TABLE ip_records;
    ALTER TABLE ip_records_new RENAME TO ip_records;

    CREATE INDEX IF NOT EXISTS idx_ip_records_range ON ip_records(range_start, range_end);
    CREATE INDEX IF NOT EXISTS idx_ip_records_status ON ip_records(status);
    CREATE INDEX IF NOT EXISTS idx_ip_records_type ON ip_records(record_type);
    CREATE INDEX IF NOT EXISTS idx_ip_records_project ON ip_records(project);
    CREATE INDEX IF NOT EXISTS idx_ip_records_parent ON ip_records(parent_subnet_id);
    CREATE INDEX IF NOT EXISTS idx_ip_records_hostname ON ip_records(hostname);
  `);
}

function relaxWorkflowStateConstraint(db) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='ip_workflows'`).get();
  if (!row?.sql || !row.sql.includes('CHECK') || row.sql.includes('REJECTED')) {
    return;
  }

  db.exec(`
    CREATE TABLE ip_workflows_new (
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
      rejected_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO ip_workflows_new (
      id, address, record_type, project, location, vlan, description, requester, state,
      netlens_result, ipam_record_id, override_reason, rejected_reason, created_at, updated_at
    )
    SELECT
      id, address, record_type, project, location, vlan, description, requester, state,
      netlens_result, ipam_record_id, override_reason, rejected_reason, created_at, updated_at
    FROM ip_workflows;
    DROP TABLE ip_workflows;
    ALTER TABLE ip_workflows_new RENAME TO ip_workflows;
    CREATE INDEX IF NOT EXISTS idx_ip_workflows_state ON ip_workflows(state);
    CREATE INDEX IF NOT EXISTS idx_ip_workflows_updated ON ip_workflows(updated_at);
  `);
}

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const row = db.prepare(`SELECT value FROM schema_meta WHERE key = 'version'`).get();
  const current = row ? Number(row.value) : 1;

  if (current < 2) {
    migrateToV2(db);
  }
  if (current < 3) {
    relaxWorkflowStateConstraint(db);
  }
  if (current < 4) {
    migrateToV4(db);
  }
  migrateToV5(db);
  fixHostUniqueIndexes(db);

  db.prepare(
    `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(SCHEMA_VERSION));
}
