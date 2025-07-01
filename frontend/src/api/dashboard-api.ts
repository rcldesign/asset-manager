import { apiClient } from '@/lib/api-client';

export interface DashboardOverview {
  assets: {
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    warrantyExpiring: number;
    maintenanceNeeded: number;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    overdue: number;
    dueToday: number;
    upcoming: number;
  };
  users: {
    total: number;
    active: number;
    byRole: Record<string, number>;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName: string;
    metadata: any;
    createdAt: string;
    actor: {
      id: string;
      firstName: string;
      lastName: string;
      avatarUrl?: string;
    };
  }>;
}

export interface KPIMetrics {
  taskCompletionRate: KPIMetric;
  averageTaskDuration: KPIMetric;
  assetUtilization: KPIMetric;
  maintenanceCompliance: KPIMetric;
}

export interface KPIMetric {
  current: number;
  previous?: number;
  change?: number;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string | string[];
    borderColor?: string;
  }>;
}

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  includeSublocations?: boolean;
}

export const dashboardApi = {
  // Get dashboard overview
  getOverview: async (filters?: DashboardFilters): Promise<DashboardOverview> => {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
    }

    const response = await apiClient.get<DashboardOverview>('/dashboards/overview', { params });
    return response.data;
  },

  // Get KPI metrics
  getKPIs: async (period: 'week' | 'month' | 'quarter' | 'year' = 'month', compare = false): Promise<KPIMetrics> => {
    const params = new URLSearchParams({
      period,
      compare: compare.toString(),
    });

    const response = await apiClient.get<KPIMetrics>('/dashboards/kpis', { params });
    return response.data;
  },

  // Get task chart data
  getTaskChart: async (
    filters?: DashboardFilters & { type?: string; groupBy?: string }
  ): Promise<ChartData> => {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
    }

    const response = await apiClient.get<ChartData>('/dashboards/charts/tasks', { params });
    return response.data;
  },

  // Get asset chart data
  getAssetChart: async (
    type: 'pie' | 'donut' | 'bar' = 'pie',
    groupBy: 'category' | 'status' | 'location' = 'category'
  ): Promise<ChartData> => {
    const params = new URLSearchParams({
      type,
      groupBy,
    });

    const response = await apiClient.get<ChartData>('/dashboards/charts/assets', { params });
    return response.data;
  },
};