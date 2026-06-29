-- PRISM initial Postgres schema for Supabase
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Project: https://acrxdkqqvcfnedljixyg.supabase.co

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Schema version (mirrors IPAM SQLite schema_meta)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO schema_meta (key, value) VALUES ('version', '5')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL DEFAULT '',
  content TEXT,
  items TEXT,
  note_type TEXT NOT NULL DEFAULT 'note',
  color TEXT,
  label TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_active ON notes (archived, pinned, sort_order);

-- ---------------------------------------------------------------------------
-- IPAM (schema v5 — IPv4 + IPv6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ip_records (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('host', 'subnet')),
  status TEXT NOT NULL DEFAULT 'used' CHECK (status IN ('free', 'used', 'reserved')),
  project TEXT NOT NULL DEFAULT '',
  vlan TEXT,
  location TEXT,
  description TEXT,
  cidr_prefix INTEGER,
  range_start BIGINT NOT NULL,
  range_end BIGINT NOT NULL,
  address_family TEXT NOT NULL DEFAULT 'ipv4',
  v6_range_start TEXT,
  v6_range_end TEXT,
  hostname TEXT,
  mac_address TEXT,
  gateway TEXT,
  dhcp_scope TEXT,
  ptr_record TEXT,
  parent_subnet_id TEXT REFERENCES ip_records (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_records_range ON ip_records (range_start, range_end);
CREATE INDEX IF NOT EXISTS idx_ip_records_status ON ip_records (status);
CREATE INDEX IF NOT EXISTS idx_ip_records_type ON ip_records (record_type);
CREATE INDEX IF NOT EXISTS idx_ip_records_project ON ip_records (project);
CREATE INDEX IF NOT EXISTS idx_ip_records_parent ON ip_records (parent_subnet_id);
CREATE INDEX IF NOT EXISTS idx_ip_records_hostname ON ip_records (hostname);
CREATE INDEX IF NOT EXISTS idx_ip_records_family ON ip_records (address_family);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_records_unique_v4_host
  ON ip_records (range_start)
  WHERE record_type = 'host' AND address_family = 'ipv4';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_records_unique_v6_host
  ON ip_records (v6_range_start)
  WHERE record_type = 'host' AND address_family = 'ipv6';

CREATE TABLE IF NOT EXISTS ip_workflows (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('host', 'subnet')),
  project TEXT NOT NULL DEFAULT '',
  location TEXT,
  vlan TEXT,
  description TEXT,
  requester TEXT NOT NULL DEFAULT 'user',
  state TEXT NOT NULL DEFAULT 'REQUESTED',
  netlens_result TEXT,
  ipam_record_id TEXT,
  override_reason TEXT,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_workflows_state ON ip_workflows (state);
CREATE INDEX IF NOT EXISTS idx_ip_workflows_updated ON ip_workflows (updated_at);

CREATE TABLE IF NOT EXISTS ip_workflow_log (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES ip_workflows (id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'user',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_workflow_log_workflow ON ip_workflow_log (workflow_id);
CREATE INDEX IF NOT EXISTS idx_ip_workflow_log_created ON ip_workflow_log (created_at);

CREATE TABLE IF NOT EXISTS ip_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  record_id TEXT,
  address TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_audit_created ON ip_audit (created_at DESC);

CREATE TABLE IF NOT EXISTS ip_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO ip_settings (key, value) VALUES ('utilization_alert_percent', '80')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plaid TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL,
  region TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  router_type TEXT,
  router_types TEXT,
  territory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  end_of_life TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  rack_position TEXT,
  chassis_slot_count INTEGER,
  ip_address TEXT,
  router_type TEXT,
  network_element TEXT,
  software_version TEXT,
  descriptor_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, serial_number)
);

CREATE TABLE IF NOT EXISTS equipment_bays (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  is_utilized INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (equipment_id, slot_index)
);

CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  slot_name TEXT NOT NULL,
  total_ports INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ports (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES slots (id) ON DELETE CASCADE,
  port_number INTEGER NOT NULL,
  is_utilized INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, port_number)
);

-- ---------------------------------------------------------------------------
-- LSP (cloud: persist topology instead of in-memory state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lsp_projects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT 'default',
  topology JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lsp_projects_updated ON lsp_projects (updated_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security — authenticated admin only
-- Enable after creating your admin user in Supabase Auth.
-- ---------------------------------------------------------------------------
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_workflow_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_bays ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lsp_projects ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'notes', 'ip_records', 'ip_workflows', 'ip_workflow_log', 'ip_audit', 'ip_settings',
    'sites', 'equipment', 'equipment_bays', 'slots', 'ports', 'lsp_projects'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS prism_admin_all ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY prism_admin_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;
