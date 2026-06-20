export interface Site {
  id: string;
  name: string;
  plaid: string;
  /** Legacy column; kept in sync with territory for SQLite compatibility */
  area: string;
  /** Canonical territory label (mirrors area when only area exists) */
  territory?: string | null;
  region: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at?: string;
  updated_at?: string;
  equipment_count?: number;
  total_ports?: number;
  utilized_ports?: number;
  utilization_pct?: number;
  /** Derived from equipment at this site (comma-separated) */
  equipment_router_types?: string | null;
}

export interface Equipment {
  id: string;
  site_id: string;
  vendor: string;
  /** Logical network element name (shown as primary label; falls back to model if unset). */
  network_element?: string | null;
  model: string;
  serial_number: string;
  router_type?: string | null;
  ip_address?: string | null;
  software_version?: string | null;
  descriptor_version?: string | null;
  end_of_life: string | null;
  status: string;
  rack_position: string | null;
  chassis_slot_count?: number | null;
  total_ports?: number;
  utilized_ports?: number;
  free_ports?: number;
  utilization_pct?: number;
}

export interface EquipmentBay {
  id: string;
  equipment_id: string;
  slot_index: number;
  label: string;
  is_utilized: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Port {
  id: string;
  slot_id: string;
  port_number: number;
  is_utilized: boolean;
  description: string;
}

export interface Slot {
  id: string;
  equipment_id: string;
  slot_name: string;
  total_ports: number;
  ports?: Port[];
}

export interface SiteSummaryRow {
  id: string;
  name: string;
  plaid: string;
  area: string;
  region: string;
  address: string | null;
  router_type?: string | null;
  equipment_count: number;
  total_ports: number;
  utilized_ports: number;
  utilization_pct: number;
}

export interface SiteDetailResponse {
  site: Site;
  equipment: Equipment[];
  summary: {
    equipment_count: number;
    /** Line-card slots (`slots` table) */
    line_slot_count: number;
    /** Chassis bay rows (`equipment_bays`); used for chassis utilization */
    slot_count: number;
    utilized_slot_count: number;
    free_slot_count: number;
    slot_utilization_pct: number;
    total_ports: number;
    utilized_ports: number;
    free_ports: number;
    utilization_pct: number;
  };
}

export interface EquipmentDetailResponse {
  equipment: Equipment;
  slots: Slot[];
  utilization: {
    total_ports: number;
    utilized_ports: number;
    free_ports: number;
    utilization_pct: number;
  };
  slot_breakdown: {
    slot_id: string;
    slot_name: string;
    total_ports: number;
    utilized_ports: number;
    utilization_pct: number;
  }[];
}

export interface ImportResult {
  success: boolean;
  added: number;
  sites_added?: number;
  equipment_added?: number;
  updated?: number;
  skipped: number;
  errors: { line: number; message: string; plaid?: string | null; site_name?: string | null }[];
}

export interface EquipmentCountResponse {
  query: string;
  total_equipment: number;
  site_count: number;
  sites: {
    site_id: string;
    site_name: string;
    site_plaid: string;
    area: string;
    region: string;
    equipment_count: number;
  }[];
  note: string;
}

export interface GlobalSummaryDashboardStats {
  scope: 'site_ids' | 'all';
  site_ids?: string[];
  site_count: number;
  equipment_count: number;
  slot_count: number;
  utilized_slot_count: number;
  free_slot_count: number;
}
