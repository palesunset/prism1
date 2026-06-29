-- Performance indexes for Inventory map bootstrap and IPAM dashboard queries.
-- Run in Supabase SQL Editor after 001_prism_schema.sql.

CREATE INDEX IF NOT EXISTS idx_equipment_site_id ON equipment (site_id);
CREATE INDEX IF NOT EXISTS idx_equipment_site_router ON equipment (site_id, router_type)
  WHERE router_type IS NOT NULL AND TRIM(router_type) != '';

CREATE INDEX IF NOT EXISTS idx_ip_records_subnet_v4 ON ip_records (record_type, address_family, range_start, range_end)
  WHERE record_type = 'subnet' AND address_family = 'ipv4';

CREATE INDEX IF NOT EXISTS idx_ip_records_host_v4 ON ip_records (record_type, address_family, range_start)
  WHERE record_type = 'host' AND address_family = 'ipv4';

CREATE INDEX IF NOT EXISTS idx_ip_records_host_v6 ON ip_records (record_type, address_family, v6_range_start)
  WHERE record_type = 'host' AND address_family = 'ipv6';
