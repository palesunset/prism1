import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDashboardBundle, fetchEquipmentUtilization } from '@/services/dashboardApi';
import type { DashboardFilters } from '@/types/dashboard';

export function useDashboardData(filters: DashboardFilters, siteUtilSort: string) {
  return useQuery({
    queryKey: ['dashboard', filters, siteUtilSort],
    queryFn: () => fetchDashboardBundle(filters, { siteUtilSort }),
  });
}

export function useEquipmentUtilization(
  filters: DashboardFilters,
  siteId: string | null,
  sort: string
) {
  return useQuery({
    queryKey: ['dashboard', 'equipment-utilization', filters, siteId, sort],
    queryFn: () => fetchEquipmentUtilization(filters, siteId!, sort),
    enabled: Boolean(siteId),
  });
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['dashboard'] });
}
