import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import type { ReportJob } from '../lib/queue';

export async function processReportJob(job: Job<ReportJob>): Promise<{
  status: string;
  reportPath: string;
  fileSize: number;
  recordCount: number;
}> {
  const { data } = job;

  try {
    await job.updateProgress(10);

    logger.info(`Processing report job`, {
      jobId: job.id,
      type: data.type,
      userId: data.userId,
      format: data.format,
    });

    await job.updateProgress(30);

    let reportData: unknown;
    let recordCount = 0;

    switch (data.type) {
      case 'asset-report':
        ({ data: reportData, count: recordCount } = await generateAssetReport(data, job));
        break;

      case 'maintenance-report':
        ({ data: reportData, count: recordCount } = await generateMaintenanceReport(data, job));
        break;

      case 'cost-analysis':
        ({ data: reportData, count: recordCount } = await generateCostAnalysis(data, job));
        break;

      case 'usage-statistics':
        ({ data: reportData, count: recordCount } = await generateUsageStatistics(data, job));
        break;

      default:
        throw new Error(`Unknown report type: ${data.type}`);
    }

    await job.updateProgress(80);

    // Generate the actual report file
    const { filePath, fileSize } = await generateReportFile(
      reportData,
      data.format,
      data.type,
      job,
    );

    await job.updateProgress(100);

    logger.info(`Report generated successfully`, {
      jobId: job.id,
      type: data.type,
      format: data.format,
      recordCount,
      fileSize,
    });

    return {
      status: 'completed',
      reportPath: filePath,
      fileSize,
      recordCount,
    };
  } catch (err) {
    logger.error('Failed to process report job', {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
      type: data.type,
      userId: data.userId,
      format: data.format,
    });
    throw err;
  }
}

async function generateAssetReport(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId, reportParams } = data;

  await job.updateProgress(40);

  const whereClause: Record<string, unknown> = {
    organizationId,
  };

  // Apply filters from reportParams
  if (reportParams.category) {
    whereClause.tags = { has: reportParams.category };
  }

  if (reportParams.dateFrom || reportParams.dateTo) {
    whereClause.createdAt = {};
    const createdAt = whereClause.createdAt as Record<string, Date>;
    if (reportParams.dateFrom) {
      createdAt.gte = new Date(reportParams.dateFrom as string);
    }
    if (reportParams.dateTo) {
      createdAt.lte = new Date(reportParams.dateTo as string);
    }
  }

  const assets = await prisma.asset.findMany({
    where: whereClause,
    include: {
      components: {
        select: {
          id: true,
          name: true,
          purchasePrice: true,
          warrantyExpiry: true,
        },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  await job.updateProgress(60);

  return {
    data: assets,
    count: assets.length,
  };
}

async function generateMaintenanceReport(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId, reportParams } = data;

  await job.updateProgress(40);

  const whereClause: Record<string, unknown> = {
    organizationId,
  };

  if (reportParams.status) {
    whereClause.status = reportParams.status;
  }

  if (reportParams.dateFrom || reportParams.dateTo) {
    whereClause.dueDate = {};
    const dueDate = whereClause.dueDate as Record<string, Date>;
    if (reportParams.dateFrom) {
      dueDate.gte = new Date(reportParams.dateFrom as string);
    }
    if (reportParams.dateTo) {
      dueDate.lte = new Date(reportParams.dateTo as string);
    }
  }

  const tasks = await prisma.task.findMany({
    where: whereClause,
    include: {
      asset: {
        select: {
          id: true,
          name: true,
          manufacturer: true,
          modelNumber: true,
        },
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: { dueDate: 'desc' },
  });

  await job.updateProgress(60);

  return {
    data: tasks,
    count: tasks.length,
  };
}

async function generateCostAnalysis(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId } = data;

  await job.updateProgress(40);

  // Get cost data from assets and tasks
  const [assets, tasks] = await Promise.all([
    prisma.asset.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        purchasePrice: true,
        purchaseDate: true,
        components: {
          select: {
            purchasePrice: true,
            purchaseDate: true,
          },
        },
      },
    }),
    prisma.task.findMany({
      where: { organizationId },
      select: {
        id: true,
        title: true,
        estimatedCost: true,
        actualCost: true,
        completedAt: true,
        asset: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  await job.updateProgress(60);

  // Calculate cost analysis
  const costAnalysis = {
    totalAssetCost: assets.reduce((sum, asset) => {
      const assetCost = asset.purchasePrice || 0;
      const componentCost = asset.components.reduce(
        (compSum, comp) => compSum + Number(comp.purchasePrice || 0),
        0,
      );
      return sum + Number(assetCost) + componentCost;
    }, 0),
    totalMaintenanceCost: tasks.reduce((sum, task) => {
      return sum + Number(task.actualCost || task.estimatedCost || 0);
    }, 0),
    assetsByValue: assets
      .map((asset) => ({
        ...asset,
        totalValue:
          Number(asset.purchasePrice || 0) +
          asset.components.reduce((sum, comp) => sum + Number(comp.purchasePrice || 0), 0),
      }))
      .sort((a, b) => b.totalValue - a.totalValue),
    maintenanceCostsByAsset: tasks.reduce(
      (acc, task) => {
        if (task.asset) {
          const assetId = task.asset.id;
          if (!acc[assetId]) {
            acc[assetId] = {
              assetName: task.asset.name,
              totalCost: 0,
              taskCount: 0,
            };
          }
          acc[assetId].totalCost += Number(task.actualCost || task.estimatedCost || 0);
          acc[assetId].taskCount += 1;
        }
        return acc;
      },
      {} as Record<string, { assetName: string; totalCost: number; taskCount: number }>,
    ),
  };

  return {
    data: costAnalysis,
    count: assets.length + tasks.length,
  };
}

async function generateUsageStatistics(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId } = data;

  await job.updateProgress(40);

  // Get various usage statistics
  const [userCount, assetCount, taskCount, completedTaskCount, recentAssets, recentTasks] =
    await Promise.all([
      prisma.user.count({ where: { organizationId, isActive: true } }),
      prisma.asset.count({ where: { organizationId } }),
      prisma.task.count({ where: { organizationId } }),
      prisma.task.count({ where: { organizationId, status: 'DONE' } }),
      prisma.asset.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.task.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, title: true, status: true, createdAt: true },
      }),
    ]);

  await job.updateProgress(60);

  const statistics = {
    overview: {
      totalUsers: userCount,
      totalAssets: assetCount,
      totalTasks: taskCount,
      completedTasks: completedTaskCount,
      taskCompletionRate: taskCount > 0 ? (completedTaskCount / taskCount) * 100 : 0,
    },
    recentActivity: {
      recentAssets,
      recentTasks,
    },
    trends: {
      // TODO: Add time-based trends
      assetsCreatedThisMonth: 0,
      tasksCompletedThisMonth: 0,
    },
  };

  return {
    data: statistics,
    count: userCount + assetCount + taskCount,
  };
}

async function generateReportFile(
  reportData: unknown,
  format: string,
  reportType: string,
  job: Job,
): Promise<{ filePath: string; fileSize: number }> {
  await job.updateProgress(85);

  // TODO: Implement actual file generation for different formats
  // For now, just create a mock file path and size

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = `/tmp/reports/${reportType}-${timestamp}.${format}`;

  // Mock file generation
  const jsonData = JSON.stringify(reportData, null, 2);
  const fileSize = Buffer.byteLength(jsonData, 'utf8');

  logger.info(`Report file generated (mock)`, {
    filePath,
    fileSize,
    format,
    reportType,
  });

  await job.updateProgress(95);

  return {
    filePath,
    fileSize,
  };
}
