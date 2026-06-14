import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDashboardBundle } from '@/services/dashboardApi';
import type { DashboardFilters } from '@/types/dashboard';

export function useDashboardData(filters: DashboardFilters, siteUtilSort: string) {
  return useQuery({
    queryKey: ['dashboard', filters, siteUtilSort],
    queryFn: () => fetchDashboardBundle(filters, { siteUtilSort }),
  });
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['dashboard'] });
}
