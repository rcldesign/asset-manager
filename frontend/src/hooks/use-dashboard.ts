import { useQuery } from '@tanstack/react-query';
import { dashboardApi, DashboardFilters } from '@/api/dashboard-api';
import { queryKeys } from '@/lib/queryKeys';

export function useDashboardOverview(filters?: DashboardFilters) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.overview, filters],
    queryFn: () => dashboardApi.getOverview(filters),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
  });
}

export function useDashboardKPIs(period: 'week' | 'month' | 'quarter' | 'year' = 'month', compare = false) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.kpis, period, compare],
    queryFn: () => dashboardApi.getKPIs(period, compare),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useTaskChart(filters?: DashboardFilters & { type?: string; groupBy?: string }) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.taskChart, filters],
    queryFn: () => dashboardApi.getTaskChart(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useAssetChart(
  type: 'pie' | 'donut' | 'bar' = 'pie',
  groupBy: 'category' | 'status' | 'location' = 'category'
) {
  return useQuery({
    queryKey: [...queryKeys.dashboard.assetChart, type, groupBy],
    queryFn: () => dashboardApi.getAssetChart(type, groupBy),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}