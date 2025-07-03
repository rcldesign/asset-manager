import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { prisma } from '../lib/prisma';
import type { TaskStatus } from '@prisma/client';

const router = Router();

// All dashboard routes require authentication
router.use(authenticateJWT);

// Validation schemas
const dashboardQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  locationId: z.string().uuid().optional(),
  includeSublocations: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

const kpiPeriodSchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year']).optional().default('month'),
  compare: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

const chartTypeSchema = z.object({
  type: z.enum(['line', 'bar', 'pie', 'donut']).optional().default('line'),
  groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
});

/**
 * @swagger
 * /api/dashboards/overview:
 *   get:
 *     summary: Get dashboard overview
 *     description: Get high-level metrics and stats for the dashboard
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for metrics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for metrics
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by location
 *       - in: query
 *         name: includeSublocations
 *         schema:
 *           type: boolean
 *         description: Include child locations in metrics
 *     responses:
 *       200:
 *         description: Dashboard overview data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 assets:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     byStatus: { type: object }
 *                     byCategory: { type: object }
 *                     warrantyExpiring: { type: integer }
 *                     maintenanceNeeded: { type: integer }
 *                 tasks:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     byStatus: { type: object }
 *                     byPriority: { type: object }
 *                     overdue: { type: integer }
 *                     dueToday: { type: integer }
 *                     upcoming: { type: integer }
 *                 users:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     active: { type: integer }
 *                     byRole: { type: object }
 *                 recentActivity:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get(
  '/overview',
  requirePermission('read', 'dashboard', { scope: 'any' }),
  validateRequest({ query: dashboardQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { startDate, endDate, locationId, includeSublocations } = authenticatedReq.query as unknown as z.infer<
        typeof dashboardQuerySchema
      >;

      const dateFilters = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };

      // Get location IDs to filter by
      const locationIds: string[] = [];
      if (locationId) {
        locationIds.push(locationId);
        if (includeSublocations) {
          // Get all child locations recursively
          const childLocations = await prisma.location.findMany({
            where: {
              organizationId: user.organizationId,
              path: {
                contains: locationId,
              },
            },
            select: { id: true },
          });
          locationIds.push(...childLocations.map((l) => l.id));
        }
      }

      const locationFilter = locationIds.length > 0 ? { in: locationIds } : undefined;

      // Get asset metrics
      const [
        totalAssets,
        assetsByStatus,
        assetsByCategory,
        warrantyExpiringAssets,
        maintenanceNeededAssets,
      ] = await Promise.all([
        prisma.asset.count({
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { locationId: locationFilter }),
          },
        }),
        prisma.asset.groupBy({
          by: ['status'],
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { locationId: locationFilter }),
          },
          _count: true,
        }),
        prisma.asset.groupBy({
          by: ['category'],
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { locationId: locationFilter }),
          },
          _count: true,
        }),
        prisma.asset.count({
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { locationId: locationFilter }),
            warrantyExpiry: {
              gte: new Date(),
              lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          },
        }),
        prisma.asset.count({
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { locationId: locationFilter }),
            status: 'MAINTENANCE',
          },
        }),
      ]);

      // Get task metrics
      const [
        totalTasks,
        tasksByStatus,
        tasksByPriority,
        overdueTasks,
        dueTodayTasks,
        upcomingTasks,
      ] = await Promise.all([
        prisma.task.count({
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { asset: { locationId: locationFilter } }),
            ...(dateFilters && { createdAt: dateFilters }),
          },
        }),
        prisma.task.groupBy({
          by: ['status'],
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { asset: { locationId: locationFilter } }),
            ...(dateFilters && { createdAt: dateFilters }),
          },
          _count: true,
        }),
        prisma.task.groupBy({
          by: ['priority'],
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { asset: { locationId: locationFilter } }),
            ...(dateFilters && { createdAt: dateFilters }),
          },
          _count: true,
        }),
        prisma.task.count({
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { asset: { locationId: locationFilter } }),
            dueDate: {
              lt: new Date(),
            },
            status: {
              not: 'DONE',
            },
          },
        }),
        prisma.task.count({
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { asset: { locationId: locationFilter } }),
            dueDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
            status: {
              not: 'DONE',
            },
          },
        }),
        prisma.task.count({
          where: {
            organizationId: user.organizationId,
            ...(locationFilter && { asset: { locationId: locationFilter } }),
            dueDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
            },
            status: {
              not: 'DONE',
            },
          },
        }),
      ]);

      // Get user metrics
      const [totalUsers, activeUsers, usersByRole] = await Promise.all([
        prisma.user.count({
          where: {
            organizationId: user.organizationId,
          },
        }),
        prisma.user.count({
          where: {
            organizationId: user.organizationId,
            lastActiveAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Active in last 30 days
            },
          },
        }),
        prisma.user.groupBy({
          by: ['role'],
          where: {
            organizationId: user.organizationId,
          },
          _count: true,
        }),
      ]);

      // Get recent activity
      const recentActivity = await prisma.activityStream.findMany({
        where: {
          organizationId: user.organizationId,
          ...(dateFilters && { createdAt: dateFilters }),
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Transform grouped data
      const transformGroupedData = (data: any[]) =>
        data.reduce(
          (acc, item) => {
            const key = Object.values(item).find((v) => typeof v === 'string') as string;
            acc[key] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        );

      res.json({
        assets: {
          total: totalAssets,
          byStatus: transformGroupedData(assetsByStatus),
          byCategory: transformGroupedData(assetsByCategory),
          warrantyExpiring: warrantyExpiringAssets,
          maintenanceNeeded: maintenanceNeededAssets,
        },
        tasks: {
          total: totalTasks,
          byStatus: transformGroupedData(tasksByStatus),
          byPriority: transformGroupedData(tasksByPriority),
          overdue: overdueTasks,
          dueToday: dueTodayTasks,
          upcoming: upcomingTasks,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          byRole: transformGroupedData(usersByRole),
        },
        recentActivity: recentActivity.map((activity) => ({
          id: activity.id,
          action: activity.action,
          entityType: activity.entityType,
          entityId: activity.entityId,
          entityName: activity.entityName,
          metadata: activity.metadata,
          createdAt: activity.createdAt,
          actor: activity.actor,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/dashboards/kpis:
 *   get:
 *     summary: Get KPI metrics
 *     description: Get key performance indicators with period comparison
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *         description: Period for KPI calculation
 *       - in: query
 *         name: compare
 *         schema:
 *           type: boolean
 *         description: Include comparison with previous period
 *     responses:
 *       200:
 *         description: KPI metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskCompletionRate:
 *                   type: object
 *                   properties:
 *                     current: { type: number }
 *                     previous: { type: number }
 *                     change: { type: number }
 *                 averageTaskDuration:
 *                   type: object
 *                   properties:
 *                     current: { type: number }
 *                     previous: { type: number }
 *                     change: { type: number }
 *                 assetUtilization:
 *                   type: object
 *                   properties:
 *                     current: { type: number }
 *                     previous: { type: number }
 *                     change: { type: number }
 *                 maintenanceCompliance:
 *                   type: object
 *                   properties:
 *                     current: { type: number }
 *                     previous: { type: number }
 *                     change: { type: number }
 */
router.get(
  '/kpis',
  requirePermission('read', 'dashboard', { scope: 'any' }),
  validateRequest({ query: kpiPeriodSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { period, compare } = authenticatedReq.query as unknown as z.infer<typeof kpiPeriodSchema>;

      // Calculate date ranges
      const now = new Date();
      let currentStart: Date;
      let previousStart: Date | null = null;
      let previousEnd: Date | null = null;

      switch (period) {
        case 'week':
          currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (compare) {
            previousEnd = currentStart;
            previousStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
          }
          break;
        case 'month':
          currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
          if (compare) {
            previousEnd = new Date(currentStart.getTime() - 1);
            previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          }
          break;
        case 'quarter':
          const quarter = Math.floor(now.getMonth() / 3);
          currentStart = new Date(now.getFullYear(), quarter * 3, 1);
          if (compare) {
            previousEnd = new Date(currentStart.getTime() - 1);
            previousStart = new Date(now.getFullYear(), quarter * 3 - 3, 1);
          }
          break;
        case 'year':
          currentStart = new Date(now.getFullYear(), 0, 1);
          if (compare) {
            previousEnd = new Date(currentStart.getTime() - 1);
            previousStart = new Date(now.getFullYear() - 1, 0, 1);
          }
          break;
      }

      // Calculate KPIs for current period
      const currentKPIs = await calculateKPIs(user.organizationId, currentStart, now);

      // Calculate KPIs for previous period if comparison is requested
      let previousKPIs = null;
      if (compare && previousStart && previousEnd) {
        previousKPIs = await calculateKPIs(user.organizationId, previousStart, previousEnd);
      }

      // Format response with comparison
      const formatKPI = (current: number, previous: number | null) => {
        const result: any = { current };
        if (previous !== null) {
          result.previous = previous;
          result.change = previous === 0 ? 0 : ((current - previous) / previous) * 100;
        }
        return result;
      };

      res.json({
        taskCompletionRate: formatKPI(
          currentKPIs.taskCompletionRate,
          previousKPIs?.taskCompletionRate ?? null,
        ),
        averageTaskDuration: formatKPI(
          currentKPIs.averageTaskDuration,
          previousKPIs?.averageTaskDuration ?? null,
        ),
        assetUtilization: formatKPI(
          currentKPIs.assetUtilization,
          previousKPIs?.assetUtilization ?? null,
        ),
        maintenanceCompliance: formatKPI(
          currentKPIs.maintenanceCompliance,
          previousKPIs?.maintenanceCompliance ?? null,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/dashboards/charts/tasks:
 *   get:
 *     summary: Get task trend chart data
 *     description: Get task completion trends over time
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for chart data
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for chart data
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [line, bar, pie, donut]
 *         description: Chart type
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *         description: Group data by period
 *     responses:
 *       200:
 *         description: Task trend chart data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 labels:
 *                   type: array
 *                   items:
 *                     type: string
 *                 datasets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                       data:
 *                         type: array
 *                         items:
 *                           type: number
 *                       backgroundColor:
 *                         type: string
 *                       borderColor:
 *                         type: string
 */
router.get(
  '/charts/tasks',
  requirePermission('read', 'dashboard', { scope: 'any' }),
  validateRequest({ query: dashboardQuerySchema.merge(chartTypeSchema) }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { startDate, endDate, groupBy } = authenticatedReq.query as unknown as z.infer<
        typeof dashboardQuerySchema & typeof chartTypeSchema
      >;

      const start = startDate
        ? new Date(startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      // Get tasks grouped by status and period
      const tasks = await prisma.task.findMany({
        where: {
          organizationId: user.organizationId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      // Group tasks by period
      const groupedData = groupTasksByPeriod(tasks, groupBy || 'day', start, end);

      // Prepare chart data
      const labels = Object.keys(groupedData);
      const statusData: Record<TaskStatus, number[]> = {
        PLANNED: [],
        IN_PROGRESS: [],
        DONE: [],
        SKIPPED: [],
      };

      labels.forEach((label) => {
        const periodTasks = groupedData[label];
        Object.keys(statusData).forEach((status) => {
          statusData[status as TaskStatus].push(
            periodTasks?.filter((t) => t.status === status).length || 0,
          );
        });
      });

      res.json({
        labels,
        datasets: [
          {
            label: 'Completed',
            data: statusData.DONE,
            backgroundColor: 'rgba(34, 197, 94, 0.5)',
            borderColor: 'rgb(34, 197, 94)',
          },
          {
            label: 'In Progress',
            data: statusData.IN_PROGRESS,
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            borderColor: 'rgb(59, 130, 246)',
          },
          {
            label: 'Planned',
            data: statusData.PLANNED,
            backgroundColor: 'rgba(156, 163, 175, 0.5)',
            borderColor: 'rgb(156, 163, 175)',
          },
          {
            label: 'Skipped',
            data: statusData.SKIPPED,
            backgroundColor: 'rgba(239, 68, 68, 0.5)',
            borderColor: 'rgb(239, 68, 68)',
          },
        ],
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/dashboards/charts/assets:
 *   get:
 *     summary: Get asset distribution chart data
 *     description: Get asset distribution by category or status
 *     tags: [Dashboards]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [line, bar, pie, donut]
 *         description: Chart type
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [category, status, location]
 *         description: Group assets by
 *     responses:
 *       200:
 *         description: Asset distribution chart data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 labels:
 *                   type: array
 *                   items:
 *                     type: string
 *                 datasets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                       data:
 *                         type: array
 *                         items:
 *                           type: number
 *                       backgroundColor:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get(
  '/charts/assets',
  requirePermission('read', 'dashboard', { scope: 'any' }),
  validateRequest({
    query: z.object({
      type: z.enum(['line', 'bar', 'pie', 'donut']).optional().default('pie'),
      groupBy: z.enum(['category', 'status', 'location']).optional().default('category'),
    }),
  }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { groupBy } = authenticatedReq.query as { type: string; groupBy: string };

      let groupedData: any[];
      let labels: string[];
      let data: number[];
      let backgroundColor: string[];

      switch (groupBy) {
        case 'category':
          groupedData = await (prisma.asset.groupBy as any)({
            by: ['category'],
            where: {
              organizationId: user.organizationId,
            },
            _count: true,
          });
          labels = groupedData.map((g) => g.category);
          data = groupedData.map((g) => g._count);
          backgroundColor = [
            '#3B82F6',
            '#10B981',
            '#F59E0B',
            '#EF4444',
            '#8B5CF6',
            '#EC4899',
            '#6B7280',
          ];
          break;

        case 'status':
          groupedData = await (prisma.asset.groupBy as any)({
            by: ['status'],
            where: {
              organizationId: user.organizationId,
            },
            _count: true,
          });
          labels = groupedData.map((g) => g.status);
          data = groupedData.map((g) => g._count);
          backgroundColor = ['#10B981', '#F59E0B', '#EF4444', '#6B7280', '#8B5CF6', '#EC4899'];
          break;

        case 'location':
          const locations = await prisma.location.findMany({
            where: {
              organizationId: user.organizationId,
            },
            include: {
              _count: {
                select: { assets: true },
              },
            },
          });
          labels = locations.map((l) => l.name);
          data = locations.map((l) => l._count.assets);
          backgroundColor = labels.map((_, i) => `hsl(${(i * 360) / labels.length}, 70%, 60%)`);
          break;

        default:
          throw new Error('Invalid groupBy parameter');
      }

      res.json({
        labels,
        datasets: [
          {
            label: `Assets by ${groupBy}`,
            data,
            backgroundColor,
          },
        ],
      });
    } catch (error) {
      next(error);
    }
  },
);

// Helper functions
async function calculateKPIs(
  organizationId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  taskCompletionRate: number;
  averageTaskDuration: number;
  assetUtilization: number;
  maintenanceCompliance: number;
}> {
  // Task completion rate
  const [totalTasks, completedTasks] = await Promise.all([
    prisma.task.count({
      where: {
        organizationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    }),
    prisma.task.count({
      where: {
        organizationId,
        status: 'DONE',
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    }),
  ]);

  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Average task duration (in hours)
  const completedTasksWithDuration = await prisma.task.findMany({
    where: {
      organizationId,
      status: 'DONE',
      completedAt: {
        gte: startDate,
        lte: endDate,
        not: null,
      },
    },
    select: {
      createdAt: true,
      completedAt: true,
    },
  });

  const averageTaskDuration =
    completedTasksWithDuration.length > 0
      ? completedTasksWithDuration.reduce((acc, task) => {
          const duration = task.completedAt!.getTime() - task.createdAt.getTime();
          return acc + duration / (1000 * 60 * 60); // Convert to hours
        }, 0) / completedTasksWithDuration.length
      : 0;

  // Asset utilization (percentage of operational assets)
  const [totalAssets, operationalAssets] = await Promise.all([
    prisma.asset.count({
      where: {
        organizationId,
      },
    }),
    prisma.asset.count({
      where: {
        organizationId,
        status: 'OPERATIONAL',
      },
    }),
  ]);

  const assetUtilization = totalAssets > 0 ? (operationalAssets / totalAssets) * 100 : 0;

  // Maintenance compliance (percentage of maintenance tasks completed on time)
  const [maintenanceTasks, allCompletedMaintenanceTasks] = await Promise.all([
    prisma.task.count({
      where: {
        organizationId,
        category: 'MAINTENANCE',
        dueDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    }),
    prisma.task.findMany({
      where: {
        organizationId,
        category: 'MAINTENANCE',
        status: 'DONE',
        dueDate: {
          gte: startDate,
          lte: endDate,
        },
        completedAt: {
          not: null,
        },
      },
      select: {
        completedAt: true,
        dueDate: true,
      },
    }),
  ]);

  // Count tasks completed on time (completed before or on due date)
  const completedMaintenanceTasks = allCompletedMaintenanceTasks.filter(
    (task) => task.completedAt && task.completedAt <= task.dueDate,
  ).length;

  const maintenanceCompliance =
    maintenanceTasks > 0 ? (completedMaintenanceTasks / maintenanceTasks) * 100 : 0;

  return {
    taskCompletionRate,
    averageTaskDuration,
    assetUtilization,
    maintenanceCompliance,
  };
}

function groupTasksByPeriod(
  tasks: any[],
  groupBy: 'day' | 'week' | 'month',
  startDate: Date,
  endDate: Date,
): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};

  // Initialize all periods with empty arrays
  const current = new Date(startDate);
  while (current <= endDate) {
    const key = formatDateByPeriod(current, groupBy);
    grouped[key] = [];

    // Increment date based on groupBy
    switch (groupBy) {
      case 'day':
        current.setDate(current.getDate() + 1);
        break;
      case 'week':
        current.setDate(current.getDate() + 7);
        break;
      case 'month':
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }

  // Group tasks into periods
  tasks.forEach((task) => {
    const key = formatDateByPeriod(task.createdAt, groupBy);
    if (grouped[key]) {
      grouped[key].push(task);
    }
  });

  return grouped;
}

function formatDateByPeriod(date: Date, period: 'day' | 'week' | 'month'): string {
  switch (period) {
    case 'day':
      return date.toISOString().split('T')[0]!;
    case 'week':
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return `Week of ${weekStart.toISOString().split('T')[0]}`;
    case 'month':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}

export default router;
