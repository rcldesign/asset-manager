/**
 * Dashboard Types and Interfaces
 *
 * Defines the data structures for all dashboard views:
 * - Overview Dashboard
 * - Asset-Centric Dashboard
 * - Calendar-Centric Dashboard
 * - Task-Centric Dashboard
 */

import type { AssetCategory, AssetStatus, TaskStatus, TaskPriority } from '@prisma/client';

/**
 * Time range options for dashboard data
 */
export enum DashboardTimeRange {
  TODAY = 'today',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  THIS_QUARTER = 'this_quarter',
  THIS_YEAR = 'this_year',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  CUSTOM = 'custom',
}

/**
 * Base dashboard request with common filters
 */
export interface DashboardRequest {
  organizationId: string;
  timeRange: DashboardTimeRange;
  startDate?: Date;
  endDate?: Date;
  locationId?: string;
  userId?: string;
}

/**
 * Overview Dashboard - High-level summary of entire system
 */
export interface OverviewDashboardData {
  summaryCards: {
    totalAssets: number;
    activeAssets: number;
    totalTasks: number;
    openTasks: number;
    overdueTasks: number;
    totalUsers: number;
    activeUsers: number;
    totalValue: number;
  };

  activityMetrics: {
    tasksCreatedCount: number;
    tasksCompletedCount: number;
    assetsAddedCount: number;
    assetsUpdatedCount: number;
    avgTaskCompletionTime: number; // in hours
    taskCompletionRate: number; // percentage
  };

  recentActivity: Array<{
    id: string;
    type: 'task_created' | 'task_completed' | 'asset_added' | 'asset_updated';
    title: string;
    timestamp: Date;
    userId: string;
    userName: string;
  }>;

  quickActions: {
    urgentTasks: Array<{
      id: string;
      title: string;
      dueDate: Date;
      priority: TaskPriority;
      assetName?: string;
    }>;
    warrantyAlerts: Array<{
      id: string;
      assetName: string;
      warrantyExpiry: Date;
      daysUntilExpiry: number;
    }>;
  };
}

/**
 * Asset-Centric Dashboard - Focus on asset health and management
 */
export interface AssetDashboardData {
  assetStatistics: {
    byCategory: Record<AssetCategory, number>;
    byStatus: Record<AssetStatus, number>;
    byLocation: Array<{
      locationId: string;
      locationName: string;
      count: number;
      value: number;
    }>;
    byAge: {
      lessThan1Year: number;
      oneToThreeYears: number;
      threeToFiveYears: number;
      moreThanFiveYears: number;
      unknown: number;
    };
  };

  warrantyAnalysis: {
    activeWarranties: number;
    expiringWarranties: Array<{
      assetId: string;
      assetName: string;
      category: AssetCategory;
      warrantyExpiry: Date;
      daysUntilExpiry: number;
      warrantyType: 'primary' | 'secondary';
    }>;
    lifetimeWarranties: number;
    expiredWarranties: number;
  };

  maintenanceHistory: {
    scheduledMaintenance: number;
    completedMaintenance: number;
    overdueMaintenance: number;
    upcomingMaintenance: Array<{
      taskId: string;
      assetId: string;
      assetName: string;
      taskTitle: string;
      dueDate: Date;
      estimatedCost: number;
    }>;
    maintenanceCosts: {
      period: number;
      actual: number;
      estimated: number;
    };
  };

  assetValue: {
    totalPurchaseValue: number;
    depreciatedValue: number;
    byCategory: Record<AssetCategory, number>;
    topValueAssets: Array<{
      id: string;
      name: string;
      category: AssetCategory;
      purchasePrice: number;
      purchaseDate?: Date;
    }>;
  };
}

/**
 * Calendar-Centric Dashboard - Task scheduling and workload view
 */
export interface CalendarDashboardData {
  taskDensity: {
    daily: Array<{
      date: Date;
      taskCount: number;
      completedCount: number;
      categories: Record<string, number>;
    }>;
    weekly: Array<{
      weekStart: Date;
      taskCount: number;
      completedCount: number;
      estimatedHours: number;
      actualHours: number;
    }>;
    monthly: Array<{
      month: string;
      year: number;
      taskCount: number;
      completedCount: number;
      estimatedCost: number;
      actualCost: number;
    }>;
  };

  scheduleData: {
    activeSchedules: number;
    recurringTasks: number;
    scheduledTasks: Array<{
      id: string;
      title: string;
      dueDate: Date;
      recurrence?: string;
      assignedUsers: Array<{
        id: string;
        name: string;
      }>;
      assetName?: string;
      priority: TaskPriority;
    }>;
  };

  workloadBalance: {
    byUser: Array<{
      userId: string;
      userName: string;
      assignedTasks: number;
      completedTasks: number;
      estimatedHours: number;
      utilization: number; // percentage
    }>;
    byTeam: Array<{
      teamId: string;
      teamName: string;
      totalTasks: number;
      avgTasksPerMember: number;
    }>;
  };

  upcomingDeadlines: Array<{
    taskId: string;
    title: string;
    dueDate: Date;
    hoursUntilDue: number;
    assignedUsers: string[];
    priority: TaskPriority;
    status: TaskStatus;
  }>;
}

/**
 * Task-Centric Dashboard - Task performance and analytics
 */
export interface TaskDashboardData {
  taskMetrics: {
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    completionRate: {
      overall: number;
      onTime: number;
      late: number;
    };
    avgCompletionTime: {
      overall: number; // hours
      byPriority: Record<TaskPriority, number>;
      byCategory: Record<string, number>;
    };
  };

  performanceAnalysis: {
    tasksCreated: number;
    tasksCompleted: number;
    tasksOverdue: number;
    tasksCancelled: number;
    completionTrend: Array<{
      date: Date;
      completed: number;
      created: number;
      overdue: number;
    }>;
  };

  costAnalysis: {
    totalEstimatedCost: number;
    totalActualCost: number;
    variance: number;
    byCategory: Array<{
      category: string;
      estimated: number;
      actual: number;
      variance: number;
    }>;
    overBudgetTasks: Array<{
      id: string;
      title: string;
      estimatedCost: number;
      actualCost: number;
      variance: number;
      percentOver: number;
    }>;
  };

  userPerformance: Array<{
    userId: string;
    userName: string;
    tasksAssigned: number;
    tasksCompleted: number;
    completionRate: number;
    avgCompletionTime: number;
    onTimeRate: number;
  }>;

  taskBacklog: {
    total: number;
    byPriority: Record<TaskPriority, number>;
    oldestTask: {
      id: string;
      title: string;
      createdAt: Date;
      daysOld: number;
    } | null;
    avgAge: number; // days
  };
}

/**
 * Combined dashboard response wrapper
 */
export interface DashboardResponse<T> {
  data: T;
  metadata: {
    generatedAt: Date;
    timeRange: DashboardTimeRange;
    startDate: Date;
    endDate: Date;
    filters: {
      organizationId: string;
      locationId?: string;
      userId?: string;
    };
  };
}
