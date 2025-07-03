import type { PrismaClient } from '@prisma/client';
import type { IRequestContext } from '../interfaces/context.interface';
import { AppError } from '../utils/errors';
import type {
  DashboardRequest,
  DashboardResponse,
  OverviewDashboardData,
  AssetDashboardData,
  CalendarDashboardData,
  TaskDashboardData,
} from '../types/dashboard';
import { DashboardTimeRange } from '../types/dashboard';
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
  format,
  differenceInHours,
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
    filters?: DashboardFilters,
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
    const [assetStats, taskStats, scheduleStats, userStats] = await Promise.all([
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
    request: DashboardRequest,
  ): Promise<DashboardResponse<OverviewDashboardData>> {
    const { startDate, endDate } = this.getDateRange(
      request.timeRange,
      request.startDate,
      request.endDate,
    );

    const [
      totalAssets,
      activeAssets,
      totalTasks,
      openTasks,
      totalUsers,
      activeUsers,
      assetValueSum,
      assetsAddedInPeriod,
      recentActivity,
      overdueTasks,
      , // upcomingTasks - placeholder for removed query
      criticalAssets,
      tasksCreatedInPeriod,
      tasksCompletedInPeriod,
      assetsUpdatedInPeriod,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { organizationId: context.organizationId } }),
      this.prisma.asset.count({ 
        where: { 
          organizationId: context.organizationId,
          status: 'OPERATIONAL'
        } 
      }),
      this.prisma.task.count({ where: { organizationId: context.organizationId } }),
      this.prisma.task.count({ 
        where: { 
          organizationId: context.organizationId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] }
        } 
      }),
      this.prisma.user.count({ where: { organizationId: context.organizationId } }),
      this.prisma.user.count({ 
        where: { 
          organizationId: context.organizationId,
          isActive: true,
          lastActiveAt: { gte: subDays(new Date(), 30) }
        } 
      }),
      this.prisma.asset.aggregate({
        where: { organizationId: context.organizationId },
        _sum: { purchasePrice: true },
      }),
      this.prisma.asset.count({
        where: {
          organizationId: context.organizationId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.activityStream.findMany({
        where: {
          organizationId: context.organizationId,
          createdAt: { gte: subDays(new Date(), 7) },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          createdAt: true,
          organizationId: true,
          userId: true,
          entityType: true,
          entityId: true,
          entityName: true,
          metadata: true,
          actor: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        include: {
          asset: { select: { name: true } },
          assignments: {
            include: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { gte: new Date(), lte: addDays(new Date(), 7) },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        include: {
          asset: { select: { name: true } },
          assignments: {
            include: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.asset.findMany({
        where: {
          organizationId: context.organizationId,
          OR: [{ warrantyExpiry: { lte: addDays(new Date(), 30) } }, { status: 'REPAIR' }],
        },
        take: 5,
        include: {
          location: { select: { name: true } },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId: context.organizationId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId: context.organizationId,
          status: 'DONE',
          completedAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.asset.count({
        where: {
          organizationId: context.organizationId,
          updatedAt: { gte: startDate, lte: endDate },
          createdAt: { lt: startDate }, // Only count updates, not new assets
        },
      }),
    ]);

    const data: OverviewDashboardData = {
      summaryCards: {
        totalAssets,
        activeAssets: activeAssets,
        totalTasks,
        openTasks: openTasks,
        overdueTasks: overdueTasks.length,
        totalUsers,
        activeUsers: activeUsers,
        totalValue: assetValueSum._sum.purchasePrice
          ? Number(assetValueSum._sum.purchasePrice)
          : 0,
      },
      activityMetrics: {
        tasksCreatedCount: tasksCreatedInPeriod,
        tasksCompletedCount: tasksCompletedInPeriod,
        assetsAddedCount: assetsAddedInPeriod,
        assetsUpdatedCount: assetsUpdatedInPeriod,
        avgTaskCompletionTime: await this.calculateAvgTaskCompletionTime(
          context.organizationId,
          startDate,
          endDate
        ),
        taskCompletionRate: tasksCreatedInPeriod > 0 
          ? Math.round((tasksCompletedInPeriod / tasksCreatedInPeriod) * 100) 
          : 0,
      },
      quickActions: {
        urgentTasks: overdueTasks.slice(0, 5).map((task) => ({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          assetName: task.asset?.name,
        })),
        warrantyAlerts: criticalAssets
          .filter((a) => a.warrantyExpiry)
          .map((asset) => ({
            id: asset.id,
            assetName: asset.name,
            warrantyExpiry: asset.warrantyExpiry!,
            daysUntilExpiry: Math.floor(
              (asset.warrantyExpiry!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
            ),
          })),
      },
      
      recentActivity: recentActivity.map((activity) => ({
        id: activity.id,
        type: activity.action as any,
        title: activity.entityName || 'Unknown',
        timestamp: activity.createdAt,
        userId: activity.userId,
        userName: activity.actor.fullName || 'Unknown',
      })),
    };

    return {
      data,
      metadata: {
        generatedAt: new Date(),
        timeRange: request.timeRange,
        startDate,
        endDate,
        filters: {
          organizationId: context.organizationId,
          locationId: request.locationId,
          userId: request.userId,
        },
      },
    };
  }

  /**
   * Get Asset Dashboard - Asset statistics, warranty alerts, maintenance history
   */
  async getAssetDashboard(
    context: IRequestContext,
    request: DashboardRequest,
  ): Promise<DashboardResponse<AssetDashboardData>> {
    const { startDate, endDate } = this.getDateRange(
      request.timeRange,
      request.startDate,
      request.endDate,
    );

    const assetWhere: any = { organizationId: context.organizationId };
    if (request.locationId) {
      assetWhere.locationId = request.locationId;
    }
    // TODO: Add category filter when needed

    const [
      ,  // totalAssets - not used
      assetsByStatus,
      assetsByCategory,
      warrantyAlerts,
      recentMaintenanceHistory,
      assetValue,
      topAssetsByValue,
      lifetimeWarranties,
      expiredWarranties,
      scheduledMaintenanceTasks,
      overdueMaintenanceTasks,
      upcomingMaintenanceTasks,
      maintenanceCostInPeriod,
    ] = await Promise.all([
      this.prisma.asset.count({ where: assetWhere }),
      this.prisma.asset.groupBy({
        by: ['status'],
        where: assetWhere,
        _count: true,
      }),
      this.prisma.asset.groupBy({
        by: ['category'],
        where: assetWhere,
        _count: true,
      }),
      this.prisma.asset.findMany({
        where: {
          ...assetWhere,
          warrantyExpiry: { lte: addDays(new Date(), 90) },
        },
        orderBy: { warrantyExpiry: 'asc' },
        take: 20,
        include: {
          location: { select: { name: true } },
        },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          asset: assetWhere,
          createdAt: { gte: startDate, lte: endDate },
          status: 'DONE',
        },
        orderBy: { completedAt: 'desc' },
        take: 15,
        include: {
          asset: { select: { name: true } },
          assignments: {
            include: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.asset.aggregate({
        where: assetWhere,
        _sum: { purchasePrice: true },
        _avg: { purchasePrice: true },
      }),
      this.prisma.asset.findMany({
        where: assetWhere,
        orderBy: { purchasePrice: 'desc' },
        take: 10,
        include: {
          location: { select: { name: true } },
        },
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          warrantyExpiry: null,
        },
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          warrantyExpiry: { lt: new Date() },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId: context.organizationId,
          category: 'MAINTENANCE',
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId: context.organizationId,
          category: 'MAINTENANCE',
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          category: 'MAINTENANCE',
          status: 'PLANNED',
          dueDate: { gte: new Date(), lte: addDays(new Date(), 30) },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        include: {
          asset: { select: { name: true } },
        },
      }),
      this.prisma.task.aggregate({
        where: {
          organizationId: context.organizationId,
          category: 'MAINTENANCE',
          status: 'DONE',
          completedAt: { gte: startDate, lte: endDate },
        },
        _sum: { actualCost: true },
      }),
    ]);

    const data: AssetDashboardData = {
      assetStatistics: {
        byCategory: assetsByCategory.reduce(
          (acc, item) => {
            acc[item.category] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        byStatus: assetsByStatus.reduce(
          (acc, item) => {
            acc[item.status] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        byLocation: await this.getAssetsByLocation(context.organizationId, assetWhere),
        byAge: await this.getAssetsByAge(context.organizationId, assetWhere)
      },
      warrantyAnalysis: {
        activeWarranties: warrantyAlerts.filter((a) => a.warrantyExpiry! > new Date()).length,
        expiringWarranties: warrantyAlerts.map((asset) => ({
          assetId: asset.id,
          assetName: asset.name,
          category: asset.category,
          warrantyExpiry: asset.warrantyExpiry!,
          daysUntilExpiry: Math.ceil(
            (asset.warrantyExpiry!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
          ),
          warrantyType: 'primary' as const,
        })),
        lifetimeWarranties: lifetimeWarranties,
        expiredWarranties: expiredWarranties,
      },
      maintenanceHistory: {
        scheduledMaintenance: scheduledMaintenanceTasks,
        completedMaintenance: recentMaintenanceHistory.length,
        overdueMaintenance: overdueMaintenanceTasks,
        upcomingMaintenance: upcomingMaintenanceTasks.map((task) => ({
          taskId: task.id,
          assetId: task.assetId || '',
          assetName: task.asset?.name || 'Unknown',
          taskTitle: task.title,
          dueDate: task.dueDate,
          estimatedCost: task.estimatedCost ? Number(task.estimatedCost) : 0,
        })),
        maintenanceCosts: {
          period: maintenanceCostInPeriod._sum.actualCost 
            ? Number(maintenanceCostInPeriod._sum.actualCost) 
            : 0,
          actual: maintenanceCostInPeriod._sum.actualCost 
            ? Number(maintenanceCostInPeriod._sum.actualCost) 
            : 0,
          estimated: 0,
        },
      },
      assetValue: {
        totalPurchaseValue: assetValue._sum.purchasePrice ? Number(assetValue._sum.purchasePrice) : 0,
        depreciatedValue: await this.calculateTotalDepreciatedValue(context.organizationId, assetWhere),
        byCategory: await this.getAssetValueByCategory(context.organizationId, assetWhere),
        topValueAssets: topAssetsByValue.map((asset) => ({
          id: asset.id,
          name: asset.name,
          category: asset.category,
          purchasePrice: asset.purchasePrice ? Number(asset.purchasePrice) : 0,
          purchaseDate: asset.purchaseDate || undefined,
        })),
      },
    };

    return {
      data,
      metadata: {
        generatedAt: new Date(),
        timeRange: request.timeRange,
        startDate,
        endDate,
        filters: {
          organizationId: context.organizationId,
          locationId: request.locationId,
          userId: request.userId,
        },
      },
    };
  }

  /**
   * Get Calendar Dashboard - Task density, schedule data, upcoming tasks
   */
  async getCalendarDashboard(
    context: IRequestContext,
    request: DashboardRequest,
  ): Promise<DashboardResponse<CalendarDashboardData>> {
    const { startDate, endDate } = this.getDateRange(
      request.timeRange,
      request.startDate,
      request.endDate,
    );

    const [tasksByDate, upcomingTasks, schedules] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          dueDate: { gte: startDate, lte: endDate },
        },
        include: {
          asset: { select: { name: true } },
          assignments: {
            include: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { gte: new Date(), lte: addDays(new Date(), 30) },
        },
        orderBy: { dueDate: 'asc' },
        include: {
          asset: { select: { name: true } },
          assignments: {
            include: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.schedule.findMany({
        where: {
          organizationId: context.organizationId,
          isActive: true,
        },
        include: {
          asset: { select: { name: true } },
        },
      }),
    ]);

    // Task density is calculated in the helper methods below

    const data: CalendarDashboardData = {
      taskDensity: {
        daily: this.calculateDailyTaskDensity(tasksByDate, startDate, endDate),
        weekly: this.calculateWeeklyTaskDensity(tasksByDate, startDate, endDate),
        monthly: this.calculateMonthlyTaskDensity(tasksByDate, startDate, endDate),
      },
      scheduleData: {
        activeSchedules: schedules.length,
        recurringTasks: schedules.filter((s) => s.scheduleType !== 'ONE_OFF').length,
        scheduledTasks: upcomingTasks.map((task) => ({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate,
          recurrence: undefined, // TODO: Add recurrence info
          assignedUsers: task.assignments?.map((a) => ({
            id: a.user.id,
            name: a.user.fullName || '',
          })) || [],
          assetName: task.asset?.name,
          priority: task.priority,
        })),
      },
      workloadBalance: {
        byUser: await this.calculateWorkloadByUser(context.organizationId, startDate, endDate),
        byTeam: await this.calculateWorkloadByTeam(context.organizationId, startDate, endDate),
      },
      upcomingDeadlines: upcomingTasks.map((task) => ({
        taskId: task.id,
        title: task.title,
        dueDate: task.dueDate,
        hoursUntilDue: Math.max(0, Math.floor((task.dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60))),
        assignedUsers: task.assignments?.map((a) => a.user.fullName || '') || [],
        priority: task.priority,
        status: task.status,
      })),
    };

    return {
      data,
      metadata: {
        generatedAt: new Date(),
        timeRange: request.timeRange,
        startDate,
        endDate,
        filters: {
          organizationId: context.organizationId,
          locationId: request.locationId,
          userId: request.userId,
        },
      },
    };
  }

  /**
   * Get Task Dashboard - Task metrics, workload data, completion rates
   */
  async getTaskDashboard(
    context: IRequestContext,
    request: DashboardRequest,
  ): Promise<DashboardResponse<TaskDashboardData>> {
    const { startDate, endDate } = this.getDateRange(
      request.timeRange,
      request.startDate,
      request.endDate,
    );

    const taskWhere: any = { organizationId: context.organizationId };
    // TODO: Add task priority filter when needed
    if (request.userId) {
      taskWhere.assignments = {
        some: {
          userId: request.userId,
        },
      };
    }

    const [
      totalTasks,
      tasksByStatus,
      tasksByPriority,
      completedTasks,
      workloadData,
      performanceMetrics,
      overdueTasks,
    ] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: taskWhere,
        _count: true,
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: 'DONE',
          completedAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.user.findMany({
        where: { organizationId: context.organizationId },
        include: {
          taskAssignments: {
            where: {
              task: {
                status: { in: ['PLANNED', 'IN_PROGRESS'] },
              },
            },
            include: {
              task: true,
            },
          },
        },
      }),
      this.prisma.task.aggregate({
        where: {
          ...taskWhere,
          status: 'DONE',
          completedAt: { gte: startDate, lte: endDate },
        },
        _avg: {
          actualMinutes: true,
          estimatedMinutes: true,
        },
        _sum: {
          actualCost: true,
          estimatedCost: true,
        },
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

    const totalTasksInPeriod = await this.prisma.task.count({
      where: {
        ...taskWhere,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const completionRate = totalTasksInPeriod > 0 ? (completedTasks / totalTasksInPeriod) * 100 : 0;

    const data: TaskDashboardData = {
      taskMetrics: {
        byStatus: tasksByStatus.reduce(
          (acc, item) => {
            acc[item.status] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        byPriority: tasksByPriority.reduce(
          (acc, item) => {
            acc[item.priority] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        completionRate: {
          overall: Math.round(completionRate),
          onTime: await this.calculateOnTimeCompletionRate(context.organizationId, taskWhere, startDate, endDate),
          late: await this.calculateLateCompletionRate(context.organizationId, taskWhere, startDate, endDate),
        },
        avgCompletionTime: {
          overall: performanceMetrics._avg.actualMinutes || 0,
          byPriority: await this.getAvgCompletionTimeByPriority(context.organizationId, taskWhere, startDate, endDate),
          byCategory: await this.getAvgCompletionTimeByCategory(context.organizationId, taskWhere, startDate, endDate),
        },
      },
      performanceAnalysis: {
        tasksCreated: totalTasksInPeriod,
        tasksCompleted: completedTasks,
        tasksOverdue: overdueTasks,
        tasksCancelled: await this.prisma.task.count({
          where: {
            ...taskWhere,
            status: 'SKIPPED',
            updatedAt: { gte: startDate, lte: endDate },
          },
        }),
        completionTrend: await this.calculateCompletionTrend(context.organizationId, taskWhere, startDate, endDate),
      },
      costAnalysis: {
        totalEstimatedCost: performanceMetrics._sum.estimatedCost
          ? Number(performanceMetrics._sum.estimatedCost)
          : 0,
        totalActualCost: performanceMetrics._sum.actualCost
          ? Number(performanceMetrics._sum.actualCost)
          : 0,
        variance: performanceMetrics._sum.estimatedCost && performanceMetrics._sum.actualCost
          ? Number(performanceMetrics._sum.actualCost) - Number(performanceMetrics._sum.estimatedCost)
          : 0,
        byCategory: await this.getCostByCategory(context.organizationId, taskWhere, startDate, endDate),
        overBudgetTasks: await this.getOverBudgetTasks(context.organizationId, taskWhere, startDate, endDate)
      },
      userPerformance: await Promise.all(
        workloadData.map(async (user) => ({
          userId: user.id,
          userName: user.fullName || user.email,
          tasksAssigned: user.taskAssignments.length,
          tasksCompleted: user.taskAssignments.filter((a) => a.task.status === 'DONE').length,
          completionRate: user.taskAssignments.length > 0
            ? (user.taskAssignments.filter((a) => a.task.status === 'DONE').length / user.taskAssignments.length) * 100
            : 0,
          avgCompletionTime: await this.getAvgCompletionTimeForUser(user.id, context.organizationId, startDate, endDate),
          onTimeRate: await this.getOnTimeRateForUser(user.id, context.organizationId, startDate, endDate)
        }))
      ),
      taskBacklog: {
        total: totalTasks - completedTasks,
        byPriority: await this.getBacklogByPriority(context.organizationId, taskWhere),
        oldestTask: await this.getOldestTask(context.organizationId, taskWhere),
        avgAge: await this.getAvgTaskAge(context.organizationId, taskWhere),
      },
    };

    return {
      data,
      metadata: {
        generatedAt: new Date(),
        timeRange: request.timeRange,
        startDate,
        endDate,
        filters: {
          organizationId: context.organizationId,
          locationId: request.locationId,
          userId: request.userId,
        },
      },
    };
  }

  /**
   * Get trending data for dashboard charts (legacy method)
   */
  async getTrendingData(
    context: IRequestContext,
    metric: 'assets' | 'tasks' | 'completions',
    days: number = 30,
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

  private async calculateAvgTaskCompletionTime(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const completedTasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    if (completedTasks.length === 0) return 0;

    const totalTime = completedTasks.reduce((sum, task) => {
      if (task.completedAt && task.createdAt) {
        const timeInHours = differenceInHours(task.completedAt, task.createdAt);
        return sum + timeInHours;
      }
      return sum;
    }, 0);

    return Math.round(totalTime / completedTasks.length);
  }

  private getDateRange(
    timeRange: DashboardTimeRange,
    customStartDate?: Date,
    customEndDate?: Date,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();

    switch (timeRange) {
      case DashboardTimeRange.TODAY:
        return {
          startDate: startOfDay(now),
          endDate: endOfDay(now),
        };
      case DashboardTimeRange.THIS_WEEK:
        return {
          startDate: startOfWeek(now),
          endDate: endOfWeek(now),
        };
      case DashboardTimeRange.THIS_MONTH:
        return {
          startDate: startOfMonth(now),
          endDate: endOfMonth(now),
        };
      case DashboardTimeRange.THIS_QUARTER:
        return {
          startDate: startOfQuarter(now),
          endDate: endOfQuarter(now),
        };
      case DashboardTimeRange.THIS_YEAR:
        return {
          startDate: startOfYear(now),
          endDate: endOfYear(now),
        };
      case DashboardTimeRange.CUSTOM:
        if (!customStartDate || !customEndDate) {
          throw new AppError('Custom date range requires both start and end dates', 400);
        }
        return {
          startDate: customStartDate,
          endDate: customEndDate,
        };
      default:
        return {
          startDate: startOfMonth(now),
          endDate: endOfMonth(now),
        };
    }
  }

  // Legacy methods for compatibility
  private async getAssetStats(assetWhere: any, thirtyDaysAgo: Date, ninetyDaysFromNow: Date) {
    const [total, byStatus, byCategory, recentlyAdded, warrantyExpiringSoon, totalValue] =
      await Promise.all([
        this.prisma.asset.count({ where: assetWhere }),
        this.prisma.asset.groupBy({
          by: ['status'],
          where: assetWhere,
          _count: true,
        }),
        this.prisma.asset.groupBy({
          by: ['category'],
          where: assetWhere,
          _count: true,
        }),
        this.prisma.asset.count({
          where: {
            ...assetWhere,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        this.prisma.asset.count({
          where: {
            ...assetWhere,
            warrantyExpiry: { lte: ninetyDaysFromNow },
          },
        }),
        this.prisma.asset.aggregate({
          where: assetWhere,
          _sum: { purchasePrice: true },
        }),
      ]);

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byCategory: byCategory.reduce(
        (acc, item) => {
          acc[item.category] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
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
    weekEnd: Date,
  ) {
    const [total, byStatus, byPriority, overdue, dueToday, dueThisWeek, completedThisMonth] =
      await Promise.all([
        this.prisma.task.count({ where: taskWhere }),
        this.prisma.task.groupBy({
          by: ['status'],
          where: taskWhere,
          _count: true,
        }),
        this.prisma.task.groupBy({
          by: ['priority'],
          where: taskWhere,
          _count: true,
        }),
        this.prisma.task.count({
          where: {
            ...taskWhere,
            status: { in: ['PLANNED', 'IN_PROGRESS'] },
            dueDate: { lt: new Date() },
          },
        }),
        this.prisma.task.count({
          where: {
            ...taskWhere,
            dueDate: { gte: todayStart, lte: todayEnd },
          },
        }),
        this.prisma.task.count({
          where: {
            ...taskWhere,
            dueDate: { gte: weekStart, lte: weekEnd },
          },
        }),
        this.prisma.task.count({
          where: {
            ...taskWhere,
            status: 'DONE',
            completedAt: { gte: startOfMonth(new Date()) },
          },
        }),
      ]);

    const completionRate = total > 0 ? (completedThisMonth / total) * 100 : 0;

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byPriority: byPriority.reduce(
        (acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      overdue,
      dueToday,
      dueThisWeek,
      completionRate: Math.round(completionRate),
    };
  }

  private async getScheduleStats(organizationId: string, now: Date, nextWeekEnd: Date) {
    const [total, active, nextWeek] = await Promise.all([
      this.prisma.schedule.count({
        where: { organizationId },
      }),
      this.prisma.schedule.count({
        where: { organizationId, isActive: true },
      }),
      // TODO: Calculate next week schedules based on schedule rules
      Promise.resolve(0), // Placeholder for next week schedules
    ]);

    return { total, active, nextWeek };
  }

  private async getUserStats(organizationId: string, _thirtyDaysAgo: Date) {
    const [total, active, byRole] = await Promise.all([
      this.prisma.user.count({
        where: { organizationId },
      }),
      this.prisma.user.count({
        where: {
          organizationId,
          isActive: true,
        },
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { organizationId },
        _count: true,
      }),
    ]);

    return {
      total,
      active,
      byRole: byRole.reduce(
        (acc, item) => {
          acc[item.role] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  private async getAssetTrend(organizationId: string, startDate: Date, endDate: Date) {
    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        category: true,
        status: true,
      },
    });

    // Group by date
    const trend = assets.reduce(
      (acc, asset) => {
        const date = format(asset.createdAt, 'yyyy-MM-dd');
        if (!acc[date]) {
          acc[date] = { total: 0, byCategory: {}, byStatus: {} };
        }
        acc[date].total++;
        acc[date].byCategory[asset.category] = (acc[date].byCategory[asset.category] || 0) + 1;
        acc[date].byStatus[asset.status] = (acc[date].byStatus[asset.status] || 0) + 1;
        return acc;
      },
      {} as Record<
        string,
        { total: number; byCategory: Record<string, number>; byStatus: Record<string, number> }
      >,
    );

    return Object.entries(trend).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  private async getTaskTrend(organizationId: string, startDate: Date, endDate: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        status: true,
        priority: true,
      },
    });

    const trend = tasks.reduce(
      (acc, task) => {
        const date = format(task.createdAt, 'yyyy-MM-dd');
        if (!acc[date]) {
          acc[date] = { total: 0, byStatus: {}, byPriority: {} };
        }
        acc[date].total++;
        acc[date].byStatus[task.status] = (acc[date].byStatus[task.status] || 0) + 1;
        acc[date].byPriority[task.priority] = (acc[date].byPriority[task.priority] || 0) + 1;
        return acc;
      },
      {} as Record<
        string,
        { total: number; byStatus: Record<string, number>; byPriority: Record<string, number> }
      >,
    );

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
        completedAt: { gte: startDate, lte: endDate },
      },
      select: {
        completedAt: true,
        estimatedMinutes: true,
        actualMinutes: true,
      },
    });

    const trend = tasks.reduce(
      (acc, task) => {
        const date = format(task.completedAt!, 'yyyy-MM-dd');
        if (!acc[date]) {
          acc[date] = { count: 0, totalEstimated: 0, totalActual: 0, efficiency: 0 };
        }
        acc[date].count++;
        acc[date].totalEstimated += task.estimatedMinutes || 0;
        acc[date].totalActual += task.actualMinutes || 0;

        // Calculate efficiency (estimated / actual * 100)
        if (acc[date].totalActual > 0) {
          acc[date].efficiency = Math.round(
            (acc[date].totalEstimated / acc[date].totalActual) * 100,
          );
        }

        return acc;
      },
      {} as Record<
        string,
        { count: number; totalEstimated: number; totalActual: number; efficiency: number }
      >,
    );

    return Object.entries(trend).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  // Helper methods for asset dashboard
  private async getAssetsByLocation(organizationId: string, assetWhere: any) {
    const assetsByLocation = await this.prisma.location.findMany({
      where: {
        organizationId,
      },
      include: {
        _count: {
          select: {
            assets: {
              where: assetWhere,
            },
          },
        },
      },
    });

    // Get asset values for each location
    const locationValues = await Promise.all(
      assetsByLocation.map(async (location) => {
        const assets = await this.prisma.asset.findMany({
          where: {
            ...assetWhere,
            locationId: location.id,
          },
          select: {
            purchasePrice: true,
          },
        });
        
        const totalValue = assets.reduce((sum, asset) => {
          return sum + (asset.purchasePrice ? Number(asset.purchasePrice) : 0);
        }, 0);
        
        return {
          locationId: location.id,
          locationName: location.name,
          count: location._count.assets,
          value: totalValue,
        };
      })
    );
    
    return locationValues;
  }

  private async getAssetsByAge(organizationId: string, assetWhere: any) {
    const now = new Date();
    const oneYearAgo = subDays(now, 365);
    const threeYearsAgo = subDays(now, 365 * 3);
    const fiveYearsAgo = subDays(now, 365 * 5);

    const [lessThan1Year, oneToThreeYears, threeToFiveYears, moreThanFiveYears, unknown] = await Promise.all([
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          purchaseDate: { gte: oneYearAgo },
        },
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          purchaseDate: { gte: threeYearsAgo, lt: oneYearAgo },
        },
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          purchaseDate: { gte: fiveYearsAgo, lt: threeYearsAgo },
        },
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          purchaseDate: { lt: fiveYearsAgo },
        },
      }),
      this.prisma.asset.count({
        where: {
          ...assetWhere,
          purchaseDate: null,
        },
      }),
    ]);

    return {
      lessThan1Year,
      oneToThreeYears,
      threeToFiveYears,
      moreThanFiveYears,
      unknown,
    };
  }

  private async calculateTotalDepreciatedValue(organizationId: string, assetWhere: any) {
    const assets = await this.prisma.asset.findMany({
      where: assetWhere,
      select: {
        purchasePrice: true,
        purchaseDate: true,
      },
    });

    let totalDepreciatedValue = 0;
    const now = new Date();

    for (const asset of assets) {
      if (asset.purchasePrice && asset.purchaseDate) {
        const yearsOld = differenceInHours(now, asset.purchaseDate) / (365 * 24);
        const depreciationRate = 20; // Default 20% per year
        const depreciatedValue = Number(asset.purchasePrice) * Math.pow(1 - depreciationRate / 100, yearsOld);
        totalDepreciatedValue += Math.max(0, depreciatedValue);
      }
    }

    return Math.round(totalDepreciatedValue);
  }

  private async getAssetValueByCategory(organizationId: string, assetWhere: any) {
    const valueByCategory = await this.prisma.asset.groupBy({
      by: ['category'],
      where: assetWhere,
      _sum: {
        purchasePrice: true,
      },
    });

    return valueByCategory.reduce(
      (acc, item) => {
        acc[item.category] = item._sum.purchasePrice ? Number(item._sum.purchasePrice) : 0;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  // Helper methods for calendar dashboard
  private calculateDailyTaskDensity(tasks: any[], startDate: Date, endDate: Date) {
    const dailyDensity: Array<{
      date: Date;
      taskCount: number;
      completedCount: number;
      categories: Record<string, number>;
    }> = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateKey = format(current, 'yyyy-MM-dd');
      const tasksForDay = tasks.filter(
        (task) => format(task.dueDate, 'yyyy-MM-dd') === dateKey
      );
      
      const completedTasks = tasksForDay.filter(
        (task) => task.status === 'COMPLETED'
      );
      
      const categories = tasksForDay.reduce((acc, task) => {
        const category = task.category || 'GENERAL';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      dailyDensity.push({
        date: new Date(current),
        taskCount: tasksForDay.length,
        completedCount: completedTasks.length,
        categories: categories,
      });
      
      current.setDate(current.getDate() + 1);
    }

    return dailyDensity;
  }

  private calculateWeeklyTaskDensity(tasks: any[], startDate: Date, endDate: Date) {
    const weeklyDensity: Array<{
      weekStart: Date;
      taskCount: number;
      completedCount: number;
      estimatedHours: number;
      actualHours: number;
    }> = [];
    const current = startOfWeek(startDate);

    while (current <= endDate) {
      const weekEnd = endOfWeek(current);
      const tasksForWeek = tasks.filter(
        (task) => task.dueDate >= current && task.dueDate <= weekEnd
      );
      
      const completedTasks = tasksForWeek.filter(
        (task) => task.status === 'COMPLETED'
      );
      
      const estimatedHours = tasksForWeek.reduce((sum, task) => {
        return sum + (task.estimatedTime ? Number(task.estimatedTime) : 0);
      }, 0);
      
      const actualHours = completedTasks.reduce((sum, task) => {
        if (task.completedAt && task.createdAt) {
          return sum + differenceInHours(task.completedAt, task.createdAt);
        }
        return sum;
      }, 0);
      
      weeklyDensity.push({
        weekStart: new Date(current),
        taskCount: tasksForWeek.length,
        completedCount: completedTasks.length,
        estimatedHours: estimatedHours,
        actualHours: actualHours,
      });
      
      current.setDate(current.getDate() + 7);
    }

    return weeklyDensity;
  }

  private calculateMonthlyTaskDensity(tasks: any[], startDate: Date, endDate: Date) {
    const monthlyDensity: Array<{
      month: string;
      year: number;
      taskCount: number;
      completedCount: number;
      estimatedCost: number;
      actualCost: number;
    }> = [];
    const current = startOfMonth(startDate);

    while (current <= endDate) {
      const monthEnd = endOfMonth(current);
      const tasksForMonth = tasks.filter(
        (task) => task.dueDate >= current && task.dueDate <= monthEnd
      );
      
      const completedTasks = tasksForMonth.filter(
        (task) => task.status === 'COMPLETED'
      );
      
      const estimatedCost = tasksForMonth.reduce((sum, task) => {
        return sum + (task.estimatedCost ? Number(task.estimatedCost) : 0);
      }, 0);
      
      const actualCost = completedTasks.reduce((sum, task) => {
        return sum + (task.actualCost ? Number(task.actualCost) : 0);
      }, 0);
      
      monthlyDensity.push({
        month: format(current, 'MMMM'),
        year: current.getFullYear(),
        taskCount: tasksForMonth.length,
        completedCount: completedTasks.length,
        estimatedCost: estimatedCost,
        actualCost: actualCost,
      });
      
      current.setMonth(current.getMonth() + 1);
    }

    return monthlyDensity;
  }

  private async calculateWorkloadByUser(organizationId: string, startDate: Date, endDate: Date) {
    const workload = await this.prisma.user.findMany({
      where: {
        organizationId,
      },
      include: {
        taskAssignments: {
          where: {
            task: {
              status: { in: ['PLANNED', 'IN_PROGRESS'] },
              dueDate: { gte: startDate, lte: endDate },
            },
          },
          include: {
            task: {
              select: {
                estimatedMinutes: true,
                priority: true,
              },
            },
          },
        },
      },
    });

    // Get completed tasks for each user
    const completedTaskCounts = await this.prisma.taskAssignment.groupBy({
      by: ['userId'],
      where: {
        task: {
          organizationId,
          status: 'DONE',
          completedAt: { gte: startDate, lte: endDate },
        },
      },
      _count: true,
    });

    const completedMap = completedTaskCounts.reduce((acc, item) => {
      acc[item.userId] = item._count;
      return acc;
    }, {} as Record<string, number>);

    return workload.map((user) => {
      const estimatedHours = user.taskAssignments.reduce(
        (sum, assignment) => sum + (assignment.task.estimatedMinutes || 0) / 60,
        0
      );
      const workingHoursPerDay = 8;
      const workingDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const availableHours = workingDays * workingHoursPerDay;
      
      return {
        userId: user.id,
        userName: user.fullName || user.email,
        assignedTasks: user.taskAssignments.length,
        completedTasks: completedMap[user.id] || 0,
        estimatedHours: estimatedHours,
        utilization: availableHours > 0 ? Math.round((estimatedHours / availableHours) * 100) : 0,
      };
    });
  }

  private async calculateWorkloadByTeam(organizationId: string, startDate: Date, endDate: Date) {
    // For now, group by role as proxy for team
    const workload = await this.prisma.user.groupBy({
      by: ['role'],
      where: {
        organizationId,
      },
      _count: true,
    });

    const teamWorkload = [];
    for (const team of workload) {
      const taskCount = await this.prisma.taskAssignment.count({
        where: {
          user: {
            organizationId,
            role: team.role,
          },
          task: {
            status: { in: ['PLANNED', 'IN_PROGRESS'] },
            dueDate: { gte: startDate, lte: endDate },
          },
        },
      });

      teamWorkload.push({
        teamId: team.role, // Using role as team ID for now
        teamName: team.role,
        totalTasks: taskCount,
        avgTasksPerMember: team._count > 0 ? Math.round(taskCount / team._count) : 0,
      });
    }

    return teamWorkload;
  }

  // Helper methods for task dashboard
  private async calculateOnTimeCompletionRate(organizationId: string, taskWhere: any, startDate: Date, endDate: Date) {
    const completedTasks = await this.prisma.task.findMany({
      where: {
        ...taskWhere,
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
        dueDate: { not: null },
      },
      select: {
        completedAt: true,
        dueDate: true,
      },
    });

    if (completedTasks.length === 0) return 0;

    const onTimeTasks = completedTasks.filter(
      (task) => task.completedAt! <= task.dueDate
    ).length;

    return Math.round((onTimeTasks / completedTasks.length) * 100);
  }

  private async calculateLateCompletionRate(organizationId: string, taskWhere: any, startDate: Date, endDate: Date) {
    const completedTasks = await this.prisma.task.findMany({
      where: {
        ...taskWhere,
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
        dueDate: { not: null },
      },
      select: {
        completedAt: true,
        dueDate: true,
      },
    });

    if (completedTasks.length === 0) return 0;

    const lateTasks = completedTasks.filter(
      (task) => task.completedAt! > task.dueDate
    ).length;

    return Math.round((lateTasks / completedTasks.length) * 100);
  }

  private async getAvgCompletionTimeByPriority(organizationId: string, taskWhere: any, startDate: Date, endDate: Date) {
    const avgByPriority = await this.prisma.task.groupBy({
      by: ['priority'],
      where: {
        ...taskWhere,
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
      },
      _avg: {
        actualMinutes: true,
      },
    });

    return avgByPriority.reduce(
      (acc, item) => {
        acc[item.priority] = Math.round(item._avg.actualMinutes || 0);
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  private async getAvgCompletionTimeByCategory(organizationId: string, taskWhere: any, startDate: Date, endDate: Date) {
    const avgByCategory = await this.prisma.task.groupBy({
      by: ['category'],
      where: {
        ...taskWhere,
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
        category: { not: null },
      },
      _avg: {
        actualMinutes: true,
      },
    });

    return avgByCategory.reduce(
      (acc, item) => {
        if (item.category) {
          acc[item.category] = Math.round(item._avg.actualMinutes || 0);
        }
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  private async calculateCompletionTrend(organizationId: string, taskWhere: any, startDate: Date, endDate: Date) {
    // Get all tasks for the period
    const allTasks = await this.prisma.task.findMany({
      where: {
        ...taskWhere,
        OR: [
          { createdAt: { gte: startDate, lte: endDate } },
          { completedAt: { gte: startDate, lte: endDate } },
          { 
            dueDate: { lte: endDate },
            status: { in: ['PLANNED', 'IN_PROGRESS'] },
          },
        ],
      },
      select: {
        createdAt: true,
        completedAt: true,
        dueDate: true,
        status: true,
      },
    });

    // Group by date
    const dateMap = new Map<string, { created: number; completed: number; overdue: number }>();
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dateKey = format(current, 'yyyy-MM-dd');
      dateMap.set(dateKey, { created: 0, completed: 0, overdue: 0 });
      current.setDate(current.getDate() + 1);
    }

    // Count tasks by date
    for (const task of allTasks) {
      // Count created
      if (task.createdAt >= startDate && task.createdAt <= endDate) {
        const createdKey = format(task.createdAt, 'yyyy-MM-dd');
        const entry = dateMap.get(createdKey);
        if (entry) entry.created++;
      }
      
      // Count completed
      if (task.status === 'DONE' && task.completedAt && task.completedAt >= startDate && task.completedAt <= endDate) {
        const completedKey = format(task.completedAt, 'yyyy-MM-dd');
        const entry = dateMap.get(completedKey);
        if (entry) entry.completed++;
      }
      
      // Count overdue for each day
      if (task.status !== 'DONE' && task.dueDate) {
        const checkDate = new Date(startDate);
        while (checkDate <= endDate) {
          if (task.dueDate < checkDate) {
            const overdueKey = format(checkDate, 'yyyy-MM-dd');
            const entry = dateMap.get(overdueKey);
            if (entry) entry.overdue++;
          }
          checkDate.setDate(checkDate.getDate() + 1);
        }
      }
    }

    const trendData: Array<{ date: Date; completed: number; created: number; overdue: number }> = [];
    
    for (const [dateKey, counts] of dateMap) {
      trendData.push({
        date: new Date(dateKey),
        completed: counts.completed,
        created: counts.created,
        overdue: counts.overdue,
      });
    }

    return trendData;
  }

  private async getCostByCategory(organizationId: string, taskWhere: any, startDate: Date, endDate: Date) {
    const costByCategory = await this.prisma.task.groupBy({
      by: ['category'],
      where: {
        ...taskWhere,
        OR: [
          { completedAt: { gte: startDate, lte: endDate } },
          { createdAt: { gte: startDate, lte: endDate } },
        ],
        category: { not: null },
      },
      _sum: {
        estimatedCost: true,
        actualCost: true,
      },
    });

    return costByCategory
      .filter((item) => item.category)
      .map((item) => {
        const estimated = item._sum.estimatedCost ? Number(item._sum.estimatedCost) : 0;
        const actual = item._sum.actualCost ? Number(item._sum.actualCost) : 0;
        const variance = actual - estimated;
        
        return {
          category: item.category!,
          estimated: estimated,
          actual: actual,
          variance: variance,
        };
      });
  }

  private async getOverBudgetTasks(organizationId: string, taskWhere: any, startDate: Date, endDate: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...taskWhere,
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
        estimatedCost: { not: null },
        actualCost: { not: null },
      },
      select: {
        id: true,
        title: true,
        estimatedCost: true,
        actualCost: true,
      },
    });

    return tasks
      .filter((task) => Number(task.actualCost) > Number(task.estimatedCost))
      .map((task) => ({
        id: task.id,
        title: task.title,
        estimatedCost: Number(task.estimatedCost),
        actualCost: Number(task.actualCost),
        variance: Number(task.actualCost) - Number(task.estimatedCost),
        percentOver: Math.round(
          ((Number(task.actualCost) - Number(task.estimatedCost)) / Number(task.estimatedCost)) * 100
        ),
      }))
      .sort((a, b) => b.variance - a.variance)
      .slice(0, 10); // Top 10 over budget tasks
  }

  private async getAvgCompletionTimeForUser(userId: string, organizationId: string, startDate: Date, endDate: Date) {
    const avgTime = await this.prisma.task.aggregate({
      where: {
        organizationId,
        assignments: {
          some: { userId },
        },
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
      },
      _avg: {
        actualMinutes: true,
      },
    });

    return avgTime._avg.actualMinutes || 0;
  }

  private async getOnTimeRateForUser(userId: string, organizationId: string, startDate: Date, endDate: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        assignments: {
          some: { userId },
        },
        status: 'DONE',
        completedAt: { gte: startDate, lte: endDate },
      },
      select: {
        completedAt: true,
        dueDate: true,
      },
    });

    if (tasks.length === 0) return 0;

    const onTimeTasks = tasks.filter(
      (task) => task.completedAt! <= task.dueDate
    ).length;

    return Math.round((onTimeTasks / tasks.length) * 100);
  }

  private async getBacklogByPriority(_organizationId: string, taskWhere: any) {
    const backlogByPriority = await this.prisma.task.groupBy({
      by: ['priority'],
      where: {
        ...taskWhere,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      _count: true,
    });

    return backlogByPriority.reduce(
      (acc, item) => {
        acc[item.priority] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  private async getOldestTask(organizationId: string, taskWhere: any) {
    const oldestTask = await this.prisma.task.findFirst({
      where: {
        ...taskWhere,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        dueDate: true,
      },
    });

    if (!oldestTask) return null;

    return {
      id: oldestTask.id,
      title: oldestTask.title,
      createdAt: oldestTask.createdAt,
      daysOld: Math.floor(
        (new Date().getTime() - oldestTask.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      ),
    };
  }

  private async getAvgTaskAge(organizationId: string, taskWhere: any) {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...taskWhere,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      select: {
        createdAt: true,
      },
    });

    if (tasks.length === 0) return 0;

    const now = new Date();
    const totalAgeDays = tasks.reduce((sum, task) => {
      return sum + (now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);

    return Math.round(totalAgeDays / tasks.length);
  }
}
