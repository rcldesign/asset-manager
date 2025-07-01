import { PrismaClient } from '@prisma/client';
import { IRequestContext } from '../interfaces/context.interface';
import { AppError, NotFoundError } from '../utils/errors';
import { 
  DashboardRequest, 
  DashboardResponse, 
  OverviewDashboardData,
  AssetDashboardData,
  CalendarDashboardData,
  TaskDashboardData,
  DashboardTimeRange
} from '../types/dashboard';
import { 
  addDays, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subDays,
  format
} from 'date-fns';

export interface DashboardStats {
  assets: {
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    recentlyAdded: number;
    warrantyExpiringSoon: number;
    totalValue: number;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    completionRate: number;
  };
  schedules: {
    total: number;
    active: number;
    nextWeek: number;
  };
  users: {
    total: number;
    active: number;
    byRole: Record<string, number>;
  };
  lastUpdated: Date;
}

export interface DashboardFilters {
  dateRange?: {
    from: Date;
    to: Date;
  };
  locationId?: string;
  assetCategoryFilter?: string[];
  taskPriorityFilter?: string[];
}

/**
 * Comprehensive Dashboard Service providing data aggregation for all dashboard views
 */
export class DashboardService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get comprehensive dashboard statistics for the organization (legacy method)
   */
  async getDashboardStats(
    context: IRequestContext,
    filters?: DashboardFilters
  ): Promise<DashboardStats> {
    const { organizationId } = context;
    const now = new Date();
    const thirtyDaysAgo = addDays(now, -30);
    const ninetyDaysFromNow = addDays(now, 90);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);
    const nextWeekEnd = endOfWeek(addDays(now, 7));

    // Build asset filters
    const assetWhere: any = { organizationId };
    if (filters?.locationId) {
      assetWhere.locationId = filters.locationId;
    }
    if (filters?.assetCategoryFilter?.length) {
      assetWhere.category = { in: filters.assetCategoryFilter };
    }

    // Build task filters
    const taskWhere: any = { organizationId };
    if (filters?.taskPriorityFilter?.length) {
      taskWhere.priority = { in: filters.taskPriorityFilter };
    }
    if (filters?.dateRange) {
      taskWhere.dueDate = {
        gte: filters.dateRange.from,
        lte: filters.dateRange.to,
      };
    }

    // Fetch all data in parallel
    const [
      assetStats,
      taskStats,
      scheduleStats,
      userStats,
    ] = await Promise.all([
      this.getAssetStats(assetWhere, thirtyDaysAgo, ninetyDaysFromNow),
      this.getTaskStats(taskWhere, todayStart, todayEnd, weekStart, weekEnd),
      this.getScheduleStats(organizationId, now, nextWeekEnd),
      this.getUserStats(organizationId, thirtyDaysAgo),
    ]);

    return {
      assets: assetStats,
      tasks: taskStats,
      schedules: scheduleStats,
      users: userStats,
      lastUpdated: now,
    };
  }

  /**
   * Get Overview Dashboard - Summary cards, activity metrics, quick actions
   */
  async getOverviewDashboard(
    context: IRequestContext,
    request: DashboardRequest
  ): Promise<DashboardResponse<OverviewDashboardData>> {
    const { startDate, endDate } = this.getDateRange(request.timeRange, request.startDate, request.endDate);
    
    const [
      totalAssets,
      totalTasks,
      totalUsers,
      assetValueSum,
      assetsAddedInPeriod,
      recentActivity,
      overdueTasks,
      upcomingTasks,
      criticalAssets
    ] = await Promise.all([
      this.prisma.asset.count({ where: { organizationId: context.organizationId } }),
      this.prisma.task.count({ where: { organizationId: context.organizationId } }),
      this.prisma.user.count({ where: { organizationId: context.organizationId } }),
      this.prisma.asset.aggregate({
        where: { organizationId: context.organizationId },
        _sum: { purchasePrice: true }
      }),
      this.prisma.asset.count({
        where: {
          organizationId: context.organizationId,
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.activityStream.findMany({
        where: {
          organizationId: context.organizationId,
          createdAt: { gte: subDays(new Date(), 7) }
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, fullName: true } }
        }
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() }
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        include: {
          asset: { select: { name: true } },
          assignee: { select: { fullName: true } }
        }
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { gte: new Date(), lte: addDays(new Date(), 7) }
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        include: {
          asset: { select: { name: true } },
          assignee: { select: { fullName: true } }
        }
      }),
      this.prisma.asset.findMany({
        where: {
          organizationId: context.organizationId,
          OR: [
            { warrantyExpiry: { lte: addDays(new Date(), 30) } },
            { status: 'NEEDS_REPAIR' }
          ]
        },
        take: 5,
        include: {
          location: { select: { name: true } }
        }
      })
    ]);

    const data: OverviewDashboardData = {
      summaryCards: {
        totalAssets,
        totalTasks,
        totalUsers,
        totalAssetValue: assetValueSum._sum.purchasePrice ? Number(assetValueSum._sum.purchasePrice) : 0,
        assetsAdded: assetsAddedInPeriod,
        tasksOverdue: overdueTasks.length
      },
      activityMetrics: {
        recentActivity: recentActivity.map(activity => ({
          id: activity.id,
          type: activity.action,
          description: activity.description,
          user: activity.user?.fullName || 'Unknown',
          timestamp: activity.createdAt,
          entityType: activity.entityType,
          entityId: activity.entityId
        })),
        assetUtilization: 85, // TODO: Calculate actual utilization
        maintenanceCompliance: 92 // TODO: Calculate actual compliance
      },
      quickActions: {
        overdueTasks: overdueTasks.map(task => ({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          assetName: task.asset?.name,
          assigneeName: task.assignee?.fullName
        })),
        upcomingTasks: upcomingTasks.map(task => ({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          assetName: task.asset?.name,
          assigneeName: task.assignee?.fullName
        })),
        criticalAssets: criticalAssets.map(asset => ({
          id: asset.id,
          name: asset.name,
          status: asset.status,
          locationName: asset.location?.name,
          warrantyExpiry: asset.warrantyExpiry,
          urgency: asset.status === 'NEEDS_REPAIR' ? 'high' : 'medium'
        }))
      }
    };

    return {
      data,
      metadata: {
        dateRange: { startDate, endDate },
        timeRange: request.timeRange,
        organizationId: context.organizationId,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Get Asset Dashboard - Asset statistics, warranty alerts, maintenance history
   */
  async getAssetDashboard(
    context: IRequestContext,
    request: DashboardRequest
  ): Promise<DashboardResponse<AssetDashboardData>> {
    const { startDate, endDate } = this.getDateRange(request.timeRange, request.startDate, request.endDate);
    
    const assetWhere: any = { organizationId: context.organizationId };
    if (request.locationId) {
      assetWhere.locationId = request.locationId;
    }
    if (request.assetCategories?.length) {
      assetWhere.category = { in: request.assetCategories };
    }

    const [
      totalAssets,
      assetsByStatus,
      assetsByCategory,
      warrantyAlerts,
      recentMaintenanceHistory,
      assetValue,
      topAssetsByValue
    ] = await Promise.all([
      this.prisma.asset.count({ where: assetWhere }),
      this.prisma.asset.groupBy({
        by: ['status'],
        where: assetWhere,
        _count: true
      }),
      this.prisma.asset.groupBy({
        by: ['category'],
        where: assetWhere,
        _count: true
      }),
      this.prisma.asset.findMany({
        where: {
          ...assetWhere,
          warrantyExpiry: { lte: addDays(new Date(), 90) }
        },
        orderBy: { warrantyExpiry: 'asc' },
        take: 20,
        include: {
          location: { select: { name: true } }
        }
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          asset: assetWhere,
          createdAt: { gte: startDate, lte: endDate },
          status: 'DONE'
        },
        orderBy: { completedAt: 'desc' },
        take: 15,
        include: {
          asset: { select: { name: true } },
          assignee: { select: { fullName: true } }
        }
      }),
      this.prisma.asset.aggregate({
        where: assetWhere,
        _sum: { purchasePrice: true },
        _avg: { purchasePrice: true }
      }),
      this.prisma.asset.findMany({
        where: assetWhere,
        orderBy: { purchasePrice: 'desc' },
        take: 10,
        include: {
          location: { select: { name: true } }
        }
      })
    ]);

    const data: AssetDashboardData = {
      assetStatistics: {
        totalAssets,
        assetsByStatus: assetsByStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<string, number>),
        assetsByCategory: assetsByCategory.reduce((acc, item) => {
          acc[item.category] = item._count;
          return acc;
        }, {} as Record<string, number>),
        totalValue: assetValue._sum.purchasePrice ? Number(assetValue._sum.purchasePrice) : 0,
        averageValue: assetValue._avg.purchasePrice ? Number(assetValue._avg.purchasePrice) : 0
      },
      warrantyAlerts: warrantyAlerts.map(asset => ({
        assetId: asset.id,
        assetName: asset.name,
        category: asset.category,
        warrantyExpiry: asset.warrantyExpiry!,
        daysUntilExpiry: Math.ceil((asset.warrantyExpiry!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
        locationName: asset.location?.name,
        urgency: asset.warrantyExpiry! <= addDays(new Date(), 30) ? 'high' : 'medium'
      })),
      maintenanceHistory: recentMaintenanceHistory.map(task => ({
        taskId: task.id,
        assetName: task.asset?.name || 'Unknown',
        taskTitle: task.title,
        completedDate: task.completedAt!,
        assigneeName: task.assignee?.fullName,
        estimatedCost: task.estimatedCost,
        actualCost: task.actualCost,
        duration: task.actualMinutes
      })),
      topAssets: topAssetsByValue.map(asset => ({
        assetId: asset.id,
        name: asset.name,
        category: asset.category,
        value: asset.purchasePrice ? Number(asset.purchasePrice) : 0,
        locationName: asset.location?.name,
        status: asset.status
      }))
    };

    return {
      data,
      metadata: {
        dateRange: { startDate, endDate },
        timeRange: request.timeRange,
        organizationId: context.organizationId,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Get Calendar Dashboard - Task density, schedule data, upcoming tasks
   */
  async getCalendarDashboard(
    context: IRequestContext,
    request: DashboardRequest
  ): Promise<DashboardResponse<CalendarDashboardData>> {
    const { startDate, endDate } = this.getDateRange(request.timeRange, request.startDate, request.endDate);
    
    const [
      tasksByDate,
      upcomingTasks,
      schedules,
      taskDensity
    ] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          dueDate: { gte: startDate, lte: endDate }
        },
        include: {
          asset: { select: { name: true } },
          assignee: { select: { fullName: true } }
        }
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { gte: new Date(), lte: addDays(new Date(), 30) }
        },
        orderBy: { dueDate: 'asc' },
        include: {
          asset: { select: { name: true } },
          assignee: { select: { fullName: true } }
        }
      }),
      this.prisma.schedule.findMany({
        where: {
          organizationId: context.organizationId,
          isActive: true
        },
        include: {
          asset: { select: { name: true } },
          assignee: { select: { fullName: true } }
        }
      }),
      this.prisma.task.groupBy({
        by: ['dueDate'],
        where: {
          organizationId: context.organizationId,
          dueDate: { gte: startDate, lte: endDate }
        },
        _count: true
      })
    ]);

    // Group tasks by date for calendar density
    const taskDensityMap = taskDensity.reduce((acc, item) => {
      const dateKey = format(item.dueDate, 'yyyy-MM-dd');
      acc[dateKey] = item._count;
      return acc;
    }, {} as Record<string, number>);

    const data: CalendarDashboardData = {
      taskDensity: taskDensityMap,
      scheduleData: schedules.map(schedule => ({
        scheduleId: schedule.id,
        title: schedule.title,
        assetName: schedule.asset?.name,
        assigneeName: schedule.assignee?.fullName,
        frequency: schedule.frequency,
        nextDue: schedule.nextDue,
        isActive: schedule.isActive
      })),
      upcomingTasks: upcomingTasks.map(task => ({
        taskId: task.id,
        title: task.title,
        dueDate: task.dueDate,
        priority: task.priority,
        status: task.status,
        assetName: task.asset?.name,
        assigneeName: task.assignee?.fullName,
        estimatedDuration: task.estimatedMinutes
      })),
      calendarEvents: tasksByDate.map(task => ({
        id: task.id,
        title: task.title,
        start: task.dueDate,
        end: task.estimatedMinutes ? 
          addDays(task.dueDate, Math.ceil(task.estimatedMinutes / 480)) : // 8 hours per day
          addDays(task.dueDate, 1),
        type: 'task',
        priority: task.priority,
        status: task.status,
        assetName: task.asset?.name
      }))
    };

    return {
      data,
      metadata: {
        dateRange: { startDate, endDate },
        timeRange: request.timeRange,
        organizationId: context.organizationId,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Get Task Dashboard - Task metrics, workload data, completion rates
   */
  async getTaskDashboard(
    context: IRequestContext,
    request: DashboardRequest
  ): Promise<DashboardResponse<TaskDashboardData>> {
    const { startDate, endDate } = this.getDateRange(request.timeRange, request.startDate, request.endDate);
    
    const taskWhere: any = { organizationId: context.organizationId };
    if (request.taskPriorities?.length) {
      taskWhere.priority = { in: request.taskPriorities };
    }
    if (request.userId) {
      taskWhere.assigneeId = request.userId;
    }

    const [
      totalTasks,
      tasksByStatus,
      tasksByPriority,
      completedTasks,
      workloadData,
      performanceMetrics,
      overdueTasks
    ] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: true
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: taskWhere,
        _count: true
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: 'DONE',
          completedAt: { gte: startDate, lte: endDate }
        }
      }),
      this.prisma.user.findMany({
        where: { organizationId: context.organizationId },
        include: {
          assignedTasks: {
            where: {
              status: { in: ['PLANNED', 'IN_PROGRESS'] }
            }
          }
        }
      }),
      this.prisma.task.aggregate({
        where: {
          ...taskWhere,
          status: 'DONE',
          completedAt: { gte: startDate, lte: endDate }
        },
        _avg: {
          actualMinutes: true,
          estimatedMinutes: true
        },
        _sum: {
          actualCost: true,
          estimatedCost: true
        }
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() }
        }
      })
    ]);

    const totalTasksInPeriod = await this.prisma.task.count({
      where: {
        ...taskWhere,
        createdAt: { gte: startDate, lte: endDate }
      }
    });

    const completionRate = totalTasksInPeriod > 0 ? (completedTasks / totalTasksInPeriod) * 100 : 0;

    const data: TaskDashboardData = {
      taskMetrics: {
        totalTasks,
        tasksByStatus: tasksByStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<string, number>),
        tasksByPriority: tasksByPriority.reduce((acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        }, {} as Record<string, number>),
        completionRate: Math.round(completionRate),
        overdueTasks,
        averageCompletionTime: performanceMetrics._avg.actualMinutes || 0
      },
      workloadData: workloadData.map(user => ({
        userId: user.id,
        userName: user.fullName,
        activeTasks: user.assignedTasks.length,
        completedThisPeriod: 0, // TODO: Calculate from actual data
        workloadPercentage: Math.min((user.assignedTasks.length / 10) * 100, 100) // Assuming 10 tasks = 100% workload
      })),
      performanceMetrics: {
        averageCompletionTime: performanceMetrics._avg.actualMinutes || 0,
        estimatedVsActualTime: {
          estimated: performanceMetrics._avg.estimatedMinutes || 0,
          actual: performanceMetrics._avg.actualMinutes || 0,
          efficiency: performanceMetrics._avg.estimatedMinutes && performanceMetrics._avg.actualMinutes ?
            Math.round((performanceMetrics._avg.estimatedMinutes / performanceMetrics._avg.actualMinutes) * 100) : 0
        },
        costMetrics: {
          totalEstimatedCost: performanceMetrics._sum.estimatedCost ? Number(performanceMetrics._sum.estimatedCost) : 0,
          totalActualCost: performanceMetrics._sum.actualCost ? Number(performanceMetrics._sum.actualCost) : 0,
          costVariance: performanceMetrics._sum.estimatedCost && performanceMetrics._sum.actualCost ?
            Number(performanceMetrics._sum.actualCost) - Number(performanceMetrics._sum.estimatedCost) : 0
        }
      }
    };

    return {
      data,
      metadata: {
        dateRange: { startDate, endDate },
        timeRange: request.timeRange,
        organizationId: context.organizationId,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Get trending data for dashboard charts (legacy method)
   */
  async getTrendingData(
    context: IRequestContext,
    metric: 'assets' | 'tasks' | 'completions',
    days: number = 30
  ): Promise<any[]> {
    const { organizationId } = context;
    const endDate = new Date();
    const startDate = subDays(endDate, days);

    switch (metric) {
      case 'assets':
        return this.getAssetTrend(organizationId, startDate, endDate);
      case 'tasks':
        return this.getTaskTrend(organizationId, startDate, endDate);
      case 'completions':
        return this.getCompletionTrend(organizationId, startDate, endDate);
      default:
        throw new AppError(`Unknown metric: ${metric}`, 400);
    }
  }

  // Private helper methods

  private getDateRange(
    timeRange: DashboardTimeRange,
    customStartDate?: Date,
    customEndDate?: Date
  ): { startDate: Date; endDate: Date } {
    const now = new Date();

    switch (timeRange) {
      case 'today':
        return {
          startDate: startOfDay(now),
          endDate: endOfDay(now)
        };
      case 'week':
        return {
          startDate: startOfWeek(now),
          endDate: endOfWeek(now)
        };
      case 'month':
        return {
          startDate: startOfMonth(now),
          endDate: endOfMonth(now)
        };
      case 'quarter':
        return {
          startDate: startOfQuarter(now),
          endDate: endOfQuarter(now)
        };
      case 'year':
        return {
          startDate: startOfYear(now),
          endDate: endOfYear(now)
        };
      case 'custom':
        if (!customStartDate || !customEndDate) {
          throw new AppError('Custom date range requires both start and end dates', 400);
        }
        return {
          startDate: customStartDate,
          endDate: customEndDate
        };
      default:
        return {
          startDate: startOfMonth(now),
          endDate: endOfMonth(now)
        };
    }
  }

  // Legacy methods for compatibility
  private async getAssetStats(assetWhere: any, thirtyDaysAgo: Date, ninetyDaysFromNow: Date) {
    const [
      total,
      byStatus,
      byCategory,
      recentlyAdded,
      warrantyExpiringSoon,
      totalValue
    ] = await Promise.all([
      this.prisma.asset.count({ where: assetWhere }),
      this.prisma.asset.groupBy({
        by: ['status'],
        where: assetWhere,
        _count: true
      }),
      this.prisma.asset.groupBy({
        by: ['category'],
        where: assetWhere,
        _count: true
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          warrantyExpiry: { lte: ninetyDaysFromNow }
        }
      }),
      this.prisma.asset.aggregate({
        where: assetWhere,
        _sum: { purchasePrice: true }
      })
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byCategory: byCategory.reduce((acc, item) => {
        acc[item.category] = item._count;
        return acc;
      }, {} as Record<string, number>),
      recentlyAdded,
      warrantyExpiringSoon,
      totalValue: totalValue._sum.purchasePrice ? Number(totalValue._sum.purchasePrice) : 0,
    };
  }

  private async getTaskStats(
    taskWhere: any,
    todayStart: Date,
    todayEnd: Date,
    weekStart: Date,
    weekEnd: Date
  ) {
    const [
      total,
      byStatus,
      byPriority,
      overdue,
      dueToday,
      dueThisWeek,
      completedThisMonth
    ] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: true
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: taskWhere,
        _count: true
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() }
        }
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          dueDate: { gte: todayStart, lte: todayEnd }
        }
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          dueDate: { gte: weekStart, lte: weekEnd }
        }
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: 'DONE',
          completedAt: { gte: startOfMonth(new Date()) }
        }
      })
    ]);

    const completionRate = total > 0 ? (completedThisMonth / total) * 100 : 0;

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = item._count;
        return acc;
      }, {} as Record<string, number>),
      overdue,
      dueToday,
      dueThisWeek,
      completionRate: Math.round(completionRate),
    };
  }

  private async getScheduleStats(organizationId: string, now: Date, nextWeekEnd: Date) {
    const [total, active, nextWeek] = await Promise.all([
      this.prisma.schedule.count({
        where: { organizationId }
      }),
      this.prisma.schedule.count({
        where: { organizationId, isActive: true }
      }),
      this.prisma.schedule.count({
        where: {
          organizationId,
          isActive: true,
          nextDue: { gte: now, lte: nextWeekEnd }
        }
      })
    ]);

    return { total, active, nextWeek };
  }

  private async getUserStats(organizationId: string, thirtyDaysAgo: Date) {
    const [total, active, byRole] = await Promise.all([
      this.prisma.user.count({
        where: { organizationId }
      }),
      this.prisma.user.count({
        where: { 
          organizationId, 
          isActive: true
        }
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { organizationId },
        _count: true
      })
    ]);

    return {
      total,
      active,
      byRole: byRole.reduce((acc, item) => {
        acc[item.role] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  private async getAssetTrend(organizationId: string, startDate: Date, endDate: Date) {
    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate, lte: endDate }
      },
      select: {
        createdAt: true,
        category: true,
        status: true
      }
    });

    // Group by date
    const trend = assets.reduce((acc, asset) => {
      const date = format(asset.createdAt, 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = { total: 0, byCategory: {}, byStatus: {} };
      }
      acc[date].total++;
      acc[date].byCategory[asset.category] = (acc[date].byCategory[asset.category] || 0) + 1;
      acc[date].byStatus[asset.status] = (acc[date].byStatus[asset.status] || 0) + 1;
      return acc;
    }, {} as Record<string, { total: number; byCategory: Record<string, number>; byStatus: Record<string, number> }>);

    return Object.entries(trend).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  private async getTaskTrend(organizationId: string, startDate: Date, endDate: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate, lte: endDate }
      },
      select: {
        createdAt: true,
        status: true,
        priority: true
      }
    });

    const trend = tasks.reduce((acc, task) => {
      const date = format(task.createdAt, 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = { total: 0, byStatus: {}, byPriority: {} };
      }
      acc[date].total++;
      acc[date].byStatus[task.status] = (acc[date].byStatus[task.status] || 0) + 1;
      acc[date].byPriority[task.priority] = (acc[date].byPriority[task.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, { total: number; byStatus: Record<string, number>; byPriority: Record<string, number> }>);

    return Object.entries(trend).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  private async getCompletionTrend(organizationId: string, startDate: Date, endDate: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate }
      },
      select: {
        completedAt: true,
        estimatedMinutes: true,
        actualMinutes: true
      }
    });

    const trend = tasks.reduce((acc, task) => {
      const date = format(task.completedAt!, 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = { count: 0, totalEstimated: 0, totalActual: 0, efficiency: 0 };
      }
      acc[date].count++;
      acc[date].totalEstimated += task.estimatedMinutes || 0;
      acc[date].totalActual += task.actualMinutes || 0;
      
      // Calculate efficiency (estimated / actual * 100)
      if (acc[date].totalActual > 0) {
        acc[date].efficiency = Math.round((acc[date].totalEstimated / acc[date].totalActual) * 100);
      }
      
      return acc;
    }, {} as Record<string, { count: number; totalEstimated: number; totalActual: number; efficiency: number }>);

    return Object.entries(trend).map(([date, data]) => ({
      date,
      ...data,
    }));
  }
}