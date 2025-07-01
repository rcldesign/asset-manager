/**
 * Report Types and Interfaces
 * Matches the backend report types
 */

import { AssetCategory, AssetStatus, TaskStatus, TaskPriority } from './index';

/**
 * Report formats supported
 */
export enum ReportFormat {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf',
  EXCEL = 'excel'
}

/**
 * Asset Age Analysis Report
 */
export interface AssetAgeAnalysisReport {
  summary: {
    totalAssets: number;
    avgAge: number; // in years
    oldestAsset: {
      id: string;
      name: string;
      purchaseDate: Date;
      ageInYears: number;
    } | null;
    newestAsset: {
      id: string;
      name: string;
      purchaseDate: Date;
      ageInYears: number;
    } | null;
  };
  
  ageDistribution: {
    range: string;
    count: number;
    percentage: number;
    totalValue: number;
  }[];
  
  byCategory: {
    category: AssetCategory;
    count: number;
    avgAge: number;
    oldestAge: number;
    newestAge: number;
  }[];
  
  depreciation: {
    originalValue: number;
    currentValue: number;
    totalDepreciation: number;
    avgDepreciationRate: number;
  };
}

/**
 * Asset Warranty Status Report
 */
export interface AssetWarrantyReport {
  summary: {
    totalAssets: number;
    underWarranty: number;
    lifetimeWarranty: number;
    expiredWarranty: number;
    noWarranty: number;
  };
  
  expiringWarranties: {
    assetId: string;
    assetName: string;
    category: AssetCategory;
    location: string;
    warrantyType: 'primary' | 'secondary';
    expiryDate: Date;
    daysUntilExpiry: number;
    warrantyScope?: string;
  }[];
  
  warrantyByCategory: {
    category: AssetCategory;
    totalAssets: number;
    underWarranty: number;
    lifetimeWarranty: number;
    avgWarrantyDays: number;
  }[];
  
  warrantyByVendor: {
    manufacturer: string;
    assetCount: number;
    avgWarrantyLength: number;
    lifetimeWarrantyCount: number;
  }[];
}

/**
 * Asset Maintenance History Report
 */
export interface AssetMaintenanceReport {
  summary: {
    totalMaintenanceTasks: number;
    completedTasks: number;
    scheduledTasks: number;
    overdueTasks: number;
    totalCost: number;
    avgCostPerTask: number;
  };
  
  maintenanceByAsset: {
    assetId: string;
    assetName: string;
    category: AssetCategory;
    taskCount: number;
    totalCost: number;
    avgTimeBetweenMaintenance: number; // days
    lastMaintenance: Date | null;
    nextScheduled: Date | null;
  }[];
  
  maintenanceByCategory: {
    category: AssetCategory;
    taskCount: number;
    totalCost: number;
    avgCost: number;
    completionRate: number;
  }[];
  
  costAnalysis: {
    estimatedVsActual: {
      totalEstimated: number;
      totalActual: number;
      variance: number;
      variancePercentage: number;
    };
    costTrend: {
      period: string;
      cost: number;
      taskCount: number;
    }[];
  };
}

/**
 * Task Completion Report
 */
export interface TaskCompletionReport {
  summary: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    avgCompletionTime: number; // hours
    onTimeCompletionRate: number;
  };
  
  byStatus: {
    status: TaskStatus;
    count: number;
    percentage: number;
  }[];
  
  byPriority: {
    priority: TaskPriority;
    totalTasks: number;
    completed: number;
    completionRate: number;
    avgCompletionTime: number;
    onTimeRate: number;
  }[];
  
  completionTrend: {
    period: string;
    created: number;
    completed: number;
    completionRate: number;
    avgCompletionTime: number;
  }[];
  
  delayAnalysis: {
    totalDelayed: number;
    avgDelayDays: number;
    delayReasons: {
      reason: string;
      count: number;
      avgDelay: number;
    }[];
  };
}

/**
 * Task Cost Analysis Report
 */
export interface TaskCostReport {
  summary: {
    totalEstimatedCost: number;
    totalActualCost: number;
    variance: number;
    variancePercentage: number;
    avgCostPerTask: number;
  };
  
  byCategory: {
    category: string;
    taskCount: number;
    estimatedCost: number;
    actualCost: number;
    variance: number;
    variancePercentage: number;
  }[];
  
  byPriority: {
    priority: TaskPriority;
    taskCount: number;
    totalCost: number;
    avgCost: number;
  }[];
  
  overBudgetTasks: {
    taskId: string;
    title: string;
    assignedTo: string[];
    estimatedCost: number;
    actualCost: number;
    overageAmount: number;
    overagePercentage: number;
  }[];
  
  costTrend: {
    period: string;
    estimatedCost: number;
    actualCost: number;
    taskCount: number;
  }[];
}

/**
 * User Workload Report
 */
export interface UserWorkloadReport {
  summary: {
    totalUsers: number;
    activeUsers: number;
    totalTasks: number;
    avgTasksPerUser: number;
    avgCompletionRate: number;
  };
  
  userMetrics: {
    userId: string;
    userName: string;
    email: string;
    assignedTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    overdueTasks: number;
    completionRate: number;
    avgCompletionTime: number;
    totalEstimatedHours: number;
    totalActualHours: number;
    efficiency: number; // actual/estimated
  }[];
  
  workloadDistribution: {
    balanced: boolean;
    standardDeviation: number;
    overloadedUsers: {
      userId: string;
      userName: string;
      taskCount: number;
      hoursAllocated: number;
    }[];
    underutilizedUsers: {
      userId: string;
      userName: string;
      taskCount: number;
      hoursAllocated: number;
    }[];
  };
  
  teamPerformance: {
    topPerformers: {
      userId: string;
      userName: string;
      completionRate: number;
      onTimeRate: number;
    }[];
    needsAttention: {
      userId: string;
      userName: string;
      overdueTasks: number;
      completionRate: number;
    }[];
  };
}

/**
 * User Performance Report
 */
export interface UserPerformanceReport {
  userId: string;
  userName: string;
  period: { startDate: Date; endDate: Date };
  
  taskMetrics: {
    assigned: number;
    completed: number;
    inProgress: number;
    overdue: number;
    cancelled: number;
    completionRate: number;
    onTimeRate: number;
  };
  
  timeMetrics: {
    totalEstimatedHours: number;
    totalActualHours: number;
    avgHoursPerTask: number;
    efficiency: number;
    overtimeHours: number;
  };
  
  qualityMetrics: {
    reworkRequired: number;
    firstTimeRight: number;
    customerSatisfaction?: number;
    avgTaskRating?: number;
  };
  
  trendAnalysis: {
    period: string;
    completed: number;
    onTime: number;
    efficiency: number;
  }[];
}

/**
 * Custom Report Builder Configuration
 */
export interface CustomReportConfig {
  name: string;
  description?: string;
  entity: 'asset' | 'task' | 'user' | 'location' | 'schedule';
  
  fields: {
    field: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
    aggregate?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  }[];
  
  filters: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'in';
    value: any;
  }[];
  
  groupBy?: string[];
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  }[];
  
  includeRelations?: string[];
}

/**
 * Custom Report Result
 */
export interface CustomReportResult {
  config: CustomReportConfig;
  data: any[];
  summary?: Record<string, any>;
  metadata: {
    totalRecords: number;
    generatedAt: Date;
    executionTime: number; // ms
  };
}

/**
 * Report generation options
 */
export interface ReportOptions {
  includeCharts?: boolean;
  includeSummary?: boolean;
  includeRawData?: boolean;
  timezone?: string;
  locale?: string;
  customBranding?: {
    logo?: string;
    companyName?: string;
    primaryColor?: string;
  };
}