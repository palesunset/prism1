export interface DashboardFilters {
  /** Territory (area) filter; OR semantics across selected values. */
  areas?: string[];
  /** Region filter; OR semantics across selected values. */
  regions?: string[];
  from?: string;
  to?: string;
  /** When set (e.g. from AI or equipment-count search), all dashboard metrics are limited to these site IDs. */
  siteIds?: string[];
  /** When set, port/equipment metrics use only these vendors (case-insensitive). */
  vendors?: string[];
  /** When set, dashboard metrics include only these equipment router types. */
  routerTypes?: string[];
}

export interface DashboardKpis {
  totalSites: number;
  totalEquipment: number;
  totalPorts: number;
  utilizedPorts: number;
  utilizationPercent: number;
  activeEquipment: number;
  eolThisYear: number;
  equipmentAddedInRange: number | null;
  sparklineEquipmentByMonth: { month: string; equipment: number }[];
  equipmentAddedTrendPercent: number;
  equipmentAddedLast30Days: number;
}

export interface VendorSlice {
  name: string;
  count: number;
  percent: number;
}

export interface StatusSlice {
  status: string;
  count: number;
}

export interface SiteUtilizationRow {
  id: string;
  name: string;
  totalPorts: number;
  utilizedPorts: number;
  freePorts: number;
  percent: number;
}

export interface AreaRegionRow {
  area: string;
  region: string;
  equipmentCount: number;
}

export interface AreaAggregate {
  area: string;
  equipment: number;
  regions: { region: string; count: number }[];
}

export interface TreemapNode {
  name: string;
  area: string;
  region: string;
  count: number;
}

export interface EolPoint {
  month: string;
  label: string;
  count: number;
  cumulative: number;
}

export interface TopSiteRow {
  id: string;
  name: string;
  equipmentCount: number;
}

export interface ActivityEvent {
  kind: string;
  at: string;
  description: string;
  siteName: string;
  refId: string;
}

export interface SiteOverviewRow {
  id: string;
  name: string;
  plaid: string;
  area: string;
  region: string;
  address: string | null;
  equipment_count: number;
  total_ports: number;
  utilized_ports: number;
  utilization_pct: number;
  operational_status: string;
}

export interface DashboardBundle {
  kpis: DashboardKpis;
  vendorDistribution: { vendors: VendorSlice[] };
  statusDistribution: { statuses: StatusSlice[] };
  siteUtilization: { sites: SiteUtilizationRow[] };
  areaRegion: {
    rows: AreaRegionRow[];
    byArea: AreaAggregate[];
    treemap: TreemapNode[];
  };
  eolTimeline: { points: EolPoint[] };
  topSites: { sites: TopSiteRow[] };
  recentActivity: { events: ActivityEvent[] };
  sitesOverview: { sites: SiteOverviewRow[] };
}
