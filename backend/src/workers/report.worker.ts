import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import type { ReportJob } from '../lib/queue';
import { addEmailJob } from '../lib/queue';
import { FileStorageService } from '../services/file-storage.service';
import PDFDocument from 'pdfkit';
import { createObjectCsvStringifier } from 'csv-writer';
import ExcelJS from 'exceljs';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';

export async function processReportJob(job: Job<ReportJob>): Promise<{
  status: string;
  reportPath: string;
  fileSize: number;
  recordCount: number;
}> {
  const { data } = job;
  const fileStorageService = new FileStorageService();

  try {
    await job.updateProgress(10);

    logger.info(`Processing report job`, {
      jobId: job.id,
      type: data.type,
      userId: data.userId,
      format: data.format,
    });

    // Check if this is a scheduled report
    const isScheduledReport = job.data.reportParams?.scheduled === true;
    const scheduledReportId = job.data.reportParams?.scheduledReportId as string | undefined;

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
        throw new Error(`Unknown report type: ${String(data.type)}`);
    }

    await job.updateProgress(80);

    // Generate the actual report file
    const { filePath, fileSize } = await generateReportFile(
      reportData,
      data.format,
      data.type,
      data.reportParams,
      job,
    );

    // Upload to storage
    const uploadedFile = await fileStorageService.uploadReportFile(filePath, {
      reportType: data.type,
      format: data.format,
      userId: data.userId,
      organizationId: data.organizationId,
    });

    // Save report history
    const reportHistory = await prisma.reportHistory.create({
      data: {
        organizationId: data.organizationId,
        generatedById: data.userId,
        type: mapReportType(data.type),
        format: data.format,
        parameters: data.reportParams as any,
        filePath: uploadedFile.id,
        fileSize: uploadedFile.fileSizeBytes,
        recordCount,
        generatedAt: new Date(),
        scheduledReportId: isScheduledReport ? scheduledReportId : null,
      },
    });

    // Update scheduled report last run time if applicable
    if (isScheduledReport && scheduledReportId) {
      await prisma.scheduledReport.update({
        where: { id: scheduledReportId },
        data: { lastRunAt: new Date() },
      });
    }

    // Send email if recipients are specified
    if (data.reportParams?.recipients && Array.isArray(data.reportParams.recipients)) {
      const downloadUrl = `${process.env.APP_URL}/api/reports/download/${reportHistory.id}`;
      
      await addEmailJob({
        to: data.reportParams.recipients as string[],
        subject: `${getReportTitle(data.type)} - ${new Date().toLocaleDateString()}`,
        html: `
          <h2>${getReportTitle(data.type)}</h2>
          <p>Your scheduled report has been generated successfully.</p>
          <p><strong>Report Details:</strong></p>
          <ul>
            <li>Type: ${getReportTitle(data.type)}</li>
            <li>Format: ${data.format.toUpperCase()}</li>
            <li>Records: ${recordCount}</li>
            <li>Generated: ${new Date().toLocaleString()}</li>
          </ul>
          <p><a href="${downloadUrl}" style="background-color: #3B82F6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Download Report</a></p>
          <p>This report will be available for download for the next 30 days.</p>
        `,
      });
    }

    // Clean up temp file
    await fs.unlink(filePath);

    await job.updateProgress(100);

    logger.info(`Report generated successfully`, {
      jobId: job.id,
      type: data.type,
      format: data.format,
      recordCount,
      fileSize,
      reportHistoryId: reportHistory.id,
    });

    return {
      status: 'completed',
      reportPath: uploadedFile.id,
      fileSize,
      recordCount,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to process report job', error, {
      jobId: job.id,
      type: data.type,
      userId: data.userId,
      format: data.format,
    });
    throw error;
  }
}

async function generateAssetReport(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId, reportParams } = data;

  await job.updateProgress(40);

  const whereClause: any = {
    organizationId,
  };

  // Apply filters from reportParams
  if (reportParams?.filters) {
    const filters = reportParams.filters as any;
    
    if (filters.locationId) {
      whereClause.locationId = filters.locationId;
    }
    
    if (filters.assetCategories && filters.assetCategories.length > 0) {
      whereClause.category = { in: filters.assetCategories };
    }
    
    if (filters.assetStatuses && filters.assetStatuses.length > 0) {
      whereClause.status = { in: filters.assetStatuses };
    }
    
    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) {
        whereClause.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        whereClause.createdAt.lte = new Date(filters.endDate);
      }
    }
  }

  const assets = await prisma.asset.findMany({
    where: whereClause,
    include: {
      location: {
        select: {
          id: true,
          name: true,
          path: true,
        },
      },
      parent: {
        select: {
          id: true,
          name: true,
        },
      },
      components: {
        select: {
          id: true,
          name: true,
          purchasePrice: true,
          warrantyExpiry: true,
        },
      },
      tasks: {
        where: {
          status: { not: 'DONE' },
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
        },
        orderBy: {
          dueDate: 'asc',
        },
        take: 5,
      },
      _count: {
        select: {
          tasks: true,
          components: true,
          attachments: true,
        },
      },
    },
    orderBy: reportParams?.sortBy
      ? { [reportParams.sortBy as string]: reportParams.sortOrder || 'asc' }
      : { createdAt: 'desc' },
  });

  await job.updateProgress(60);

  // Calculate summary statistics
  const summary = {
    totalAssets: assets.length,
    byStatus: assets.reduce((acc, asset) => {
      acc[asset.status] = (acc[asset.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byCategory: assets.reduce((acc, asset) => {
      acc[asset.category] = (acc[asset.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    totalValue: assets.reduce((sum, asset) => sum + Number(asset.purchasePrice || 0), 0),
    warrantyExpiring: assets.filter(
      (asset) =>
        asset.warrantyExpiry &&
        asset.warrantyExpiry > new Date() &&
        asset.warrantyExpiry < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ).length,
  };

  return {
    data: {
      summary,
      assets: assets.map((asset) => ({
        ...asset,
        totalValue:
          Number(asset.purchasePrice || 0) +
          asset.components.reduce((sum, comp) => sum + Number(comp.purchasePrice || 0), 0),
      })),
    },
    count: assets.length,
  };
}

async function generateMaintenanceReport(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId, reportParams } = data;

  await job.updateProgress(40);

  const whereClause: any = {
    organizationId,
    isMaintenanceTask: true,
  };

  // Apply filters
  if (reportParams?.filters) {
    const filters = reportParams.filters as any;
    
    if (filters.taskStatuses && filters.taskStatuses.length > 0) {
      whereClause.status = { in: filters.taskStatuses };
    }
    
    if (filters.taskPriorities && filters.taskPriorities.length > 0) {
      whereClause.priority = { in: filters.taskPriorities };
    }
    
    if (filters.startDate || filters.endDate) {
      whereClause.dueDate = {};
      if (filters.startDate) {
        whereClause.dueDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        whereClause.dueDate.lte = new Date(filters.endDate);
      }
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
          serialNumber: true,
          location: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      schedule: {
        select: {
          id: true,
          name: true,
          type: true,
          frequency: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  await job.updateProgress(60);

  // Calculate maintenance statistics
  const stats = {
    totalTasks: tasks.length,
    byStatus: tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byPriority: tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    overdue: tasks.filter((task) => task.dueDate && task.dueDate < new Date() && task.status !== 'DONE').length,
    dueThisWeek: tasks.filter(
      (task) =>
        task.dueDate &&
        task.dueDate >= new Date() &&
        task.dueDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ).length,
    completionRate:
      tasks.length > 0 ? (tasks.filter((task) => task.status === 'DONE').length / tasks.length) * 100 : 0,
    estimatedCost: tasks.reduce((sum, task) => sum + Number(task.estimatedCost || 0), 0),
    actualCost: tasks.reduce((sum, task) => sum + Number(task.actualCost || 0), 0),
  };

  return {
    data: {
      summary: stats,
      tasks,
    },
    count: tasks.length,
  };
}

async function generateCostAnalysis(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId, reportParams } = data;

  await job.updateProgress(40);

  const dateFilter: any = {};
  if (reportParams?.filters) {
    const filters = reportParams.filters as any;
    if (filters.startDate || filters.endDate) {
      if (filters.startDate) {
        dateFilter.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        dateFilter.lte = new Date(filters.endDate);
      }
    }
  }

  // Get cost data from assets and tasks
  const [assets, tasks] = await Promise.all([
    prisma.asset.findMany({
      where: {
        organizationId,
        ...(Object.keys(dateFilter).length > 0 && { purchaseDate: dateFilter }),
      },
      select: {
        id: true,
        name: true,
        category: true,
        purchasePrice: true,
        purchaseDate: true,
        location: {
          select: {
            name: true,
          },
        },
        components: {
          select: {
            name: true,
            purchasePrice: true,
            purchaseDate: true,
          },
        },
      },
    }),
    prisma.task.findMany({
      where: {
        organizationId,
        ...(Object.keys(dateFilter).length > 0 && { completedAt: dateFilter }),
      },
      select: {
        id: true,
        title: true,
        estimatedCost: true,
        actualCost: true,
        completedAt: true,
        status: true,
        asset: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    }),
  ]);

  await job.updateProgress(60);

  // Calculate cost analysis
  const costAnalysis = {
    summary: {
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
      totalCost: 0, // Will be calculated below
    },
    assetsByValue: assets
      .map((asset) => ({
        ...asset,
        totalValue:
          Number(asset.purchasePrice || 0) +
          asset.components.reduce((sum, comp) => sum + Number(comp.purchasePrice || 0), 0),
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 20), // Top 20 assets by value
    maintenanceCostsByAsset: tasks.reduce(
      (acc, task) => {
        if (task.asset) {
          const assetId = task.asset.id;
          if (!acc[assetId]) {
            acc[assetId] = {
              assetId,
              assetName: task.asset.name,
              assetCategory: task.asset.category,
              totalCost: 0,
              taskCount: 0,
              completedTasks: 0,
            };
          }
          acc[assetId].totalCost += Number(task.actualCost || task.estimatedCost || 0);
          acc[assetId].taskCount += 1;
          if (task.status === 'DONE') {
            acc[assetId].completedTasks += 1;
          }
        }
        return acc;
      },
      {} as Record<string, any>,
    ),
    costByCategory: {
      assets: assets.reduce((acc, asset) => {
        const category = asset.category;
        if (!acc[category]) {
          acc[category] = 0;
        }
        acc[category] +=
          Number(asset.purchasePrice || 0) +
          asset.components.reduce((sum, comp) => sum + Number(comp.purchasePrice || 0), 0);
        return acc;
      }, {} as Record<string, number>),
      maintenance: tasks.reduce((acc, task) => {
        if (task.asset) {
          const category = task.asset.category;
          if (!acc[category]) {
            acc[category] = 0;
          }
          acc[category] += Number(task.actualCost || task.estimatedCost || 0);
        }
        return acc;
      }, {} as Record<string, number>),
    },
  };

  costAnalysis.summary.totalCost = costAnalysis.summary.totalAssetCost + costAnalysis.summary.totalMaintenanceCost;

  return {
    data: costAnalysis,
    count: assets.length + tasks.length,
  };
}

async function generateUsageStatistics(
  data: ReportJob,
  job: Job,
): Promise<{ data: unknown; count: number }> {
  const { organizationId, reportParams } = data;

  await job.updateProgress(40);

  const dateFilter: any = {};
  if (reportParams?.filters) {
    const filters = reportParams.filters as any;
    if (filters.startDate || filters.endDate) {
      if (filters.startDate) {
        dateFilter.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        dateFilter.lte = new Date(filters.endDate);
      }
    }
  }

  // Get various usage statistics
  const [
    userStats,
    assetStats,
    taskStats,
    locationStats,
    recentActivity,
  ] = await Promise.all([
    // User statistics
    prisma.user.groupBy({
      by: ['role'],
      where: {
        organizationId,
        isActive: true,
      },
      _count: true,
    }),
    // Asset statistics
    Promise.all([
      prisma.asset.count({ where: { organizationId } }),
      prisma.asset.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),
      prisma.asset.groupBy({
        by: ['category'],
        where: { organizationId },
        _count: true,
      }),
    ]),
    // Task statistics
    Promise.all([
      prisma.task.count({ where: { organizationId } }),
      prisma.task.count({ where: { organizationId, status: 'DONE' } }),
      prisma.task.groupBy({
        by: ['priority'],
        where: { organizationId },
        _count: true,
      }),
      prisma.task.aggregate({
        where: {
          organizationId,
          status: 'DONE',
          completedAt: { not: null },
        },
        _avg: {
          actualCost: true,
        },
      }),
    ]),
    // Location statistics
    prisma.location.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { assets: true },
        },
      },
    }),
    // Recent activity
    prisma.activityStream.findMany({
      where: {
        organizationId,
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
  ]);

  await job.updateProgress(60);

  const [totalAssets, assetsByStatus, assetsByCategory] = assetStats;
  const [totalTasks, completedTasks, tasksByPriority, avgTaskCost] = taskStats;

  const statistics = {
    overview: {
      totalUsers: userStats.reduce((sum, u) => sum + u._count, 0),
      usersByRole: userStats.reduce((acc, u) => {
        acc[u.role] = u._count;
        return acc;
      }, {} as Record<string, number>),
      totalAssets,
      assetsByStatus: assetsByStatus.reduce((acc, a) => {
        acc[a.status] = a._count;
        return acc;
      }, {} as Record<string, number>),
      assetsByCategory: assetsByCategory.reduce((acc, a) => {
        acc[a.category] = a._count;
        return acc;
      }, {} as Record<string, number>),
      totalTasks,
      completedTasks,
      taskCompletionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      tasksByPriority: tasksByPriority.reduce((acc, t) => {
        acc[t.priority] = t._count;
        return acc;
      }, {} as Record<string, number>),
      averageTaskCost: avgTaskCost._avg.actualCost || 0,
    },
    locationUtilization: locationStats
      .map((loc) => ({
        id: loc.id,
        name: loc.name,
        assetCount: loc._count.assets,
      }))
      .sort((a, b) => b.assetCount - a.assetCount),
    activitySummary: {
      totalActivities: recentActivity.length,
      byAction: recentActivity.reduce((acc, activity) => {
        acc[activity.action] = (acc[activity.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byEntityType: recentActivity.reduce((acc, activity) => {
        acc[activity.entityType] = (acc[activity.entityType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      topUsers: Object.entries(
        recentActivity.reduce((acc, activity) => {
          if (activity.actor) {
            const name = `${activity.actor.firstName} ${activity.actor.lastName}`;
            acc[name] = (acc[name] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    },
  };

  const totalRecords = userStats.length + totalAssets + totalTasks + locationStats.length + recentActivity.length;

  return {
    data: statistics,
    count: totalRecords,
  };
}

async function generateReportFile(
  reportData: unknown,
  format: string,
  reportType: string,
  reportParams: any,
  job: Job,
): Promise<{ filePath: string; fileSize: number }> {
  await job.updateProgress(85);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${reportType}-${timestamp}.${format}`;
  const tempDir = path.join(process.cwd(), 'temp', 'reports');
  await fs.mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, filename);

  switch (format) {
    case 'pdf':
      await generatePDFReport(filePath, reportData, reportType, reportParams);
      break;
    case 'csv':
      await generateCSVReport(filePath, reportData, reportType);
      break;
    case 'xlsx':
      await generateExcelReport(filePath, reportData, reportType, reportParams);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  const stats = await fs.stat(filePath);
  
  await job.updateProgress(95);

  return {
    filePath,
    fileSize: stats.size,
  };
}

async function generatePDFReport(
  filePath: string,
  data: any,
  reportType: string,
  reportParams: any,
): Promise<void> {
  const doc = new PDFDocument({ margin: 50 });
  const stream = doc.pipe(createWriteStream(filePath));

  // Header
  doc.fontSize(20).text(getReportTitle(reportType), { align: 'center' });
  doc.fontSize(12).text(new Date().toLocaleDateString(), { align: 'center' });
  doc.moveDown();

  // Report content based on type
  switch (reportType) {
    case 'asset-report':
      generateAssetPDFContent(doc, data);
      break;
    case 'maintenance-report':
      generateMaintenancePDFContent(doc, data);
      break;
    case 'cost-analysis':
      generateCostAnalysisPDFContent(doc, data);
      break;
    case 'usage-statistics':
      generateUsageStatisticsPDFContent(doc, data);
      break;
  }

  doc.end();
  await new Promise((resolve) => stream.on('finish', resolve));
}

function generateAssetPDFContent(doc: PDFKit.PDFDocument, data: any): void {
  // Summary section
  if (data.summary) {
    doc.fontSize(16).text('Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Assets: ${data.summary.totalAssets}`);
    doc.text(`Total Value: $${data.summary.totalValue.toFixed(2)}`);
    doc.text(`Warranty Expiring Soon: ${data.summary.warrantyExpiring}`);
    doc.moveDown();

    // Status breakdown
    doc.fontSize(14).text('Assets by Status');
    Object.entries(data.summary.byStatus).forEach(([status, count]) => {
      doc.fontSize(10).text(`${status}: ${count}`);
    });
    doc.moveDown();

    // Category breakdown
    doc.fontSize(14).text('Assets by Category');
    Object.entries(data.summary.byCategory).forEach(([category, count]) => {
      doc.fontSize(10).text(`${category}: ${count}`);
    });
    doc.moveDown();
  }

  // Asset details
  doc.addPage();
  doc.fontSize(16).text('Asset Details', { underline: true });
  doc.moveDown();

  data.assets.forEach((asset: any, index: number) => {
    if (index > 0) doc.moveDown();
    
    doc.fontSize(12).text(`${asset.name}`, { underline: true });
    doc.fontSize(10);
    doc.text(`Category: ${asset.category}`);
    doc.text(`Status: ${asset.status}`);
    doc.text(`Serial Number: ${asset.serialNumber || 'N/A'}`);
    doc.text(`Location: ${asset.location?.name || 'N/A'}`);
    doc.text(`Purchase Price: $${(asset.purchasePrice || 0).toFixed(2)}`);
    doc.text(`Total Value: $${asset.totalValue.toFixed(2)}`);
    
    if (asset.tasks && asset.tasks.length > 0) {
      doc.text(`Pending Tasks: ${asset.tasks.length}`);
    }
  });
}

function generateMaintenancePDFContent(doc: PDFKit.PDFDocument, data: any): void {
  // Summary section
  if (data.summary) {
    doc.fontSize(16).text('Maintenance Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Tasks: ${data.summary.totalTasks}`);
    doc.text(`Overdue: ${data.summary.overdue}`);
    doc.text(`Due This Week: ${data.summary.dueThisWeek}`);
    doc.text(`Completion Rate: ${data.summary.completionRate.toFixed(1)}%`);
    doc.text(`Estimated Cost: $${data.summary.estimatedCost.toFixed(2)}`);
    doc.text(`Actual Cost: $${data.summary.actualCost.toFixed(2)}`);
    doc.moveDown();
  }

  // Task details
  doc.addPage();
  doc.fontSize(16).text('Maintenance Tasks', { underline: true });
  doc.moveDown();

  data.tasks.forEach((task: any, index: number) => {
    if (index > 0) doc.moveDown();
    
    doc.fontSize(12).text(task.title, { underline: true });
    doc.fontSize(10);
    doc.text(`Status: ${task.status}`);
    doc.text(`Priority: ${task.priority}`);
    doc.text(`Due Date: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}`);
    doc.text(`Asset: ${task.asset?.name || 'N/A'}`);
    
    if (task.assignments && task.assignments.length > 0) {
      const assignees = task.assignments
        .map((a: any) => `${a.user.firstName} ${a.user.lastName}`)
        .join(', ');
      doc.text(`Assigned to: ${assignees}`);
    }
  });
}

function generateCostAnalysisPDFContent(doc: PDFKit.PDFDocument, data: any): void {
  doc.fontSize(16).text('Cost Analysis Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Asset Cost: $${data.summary.totalAssetCost.toFixed(2)}`);
  doc.text(`Total Maintenance Cost: $${data.summary.totalMaintenanceCost.toFixed(2)}`);
  doc.text(`Total Cost: $${data.summary.totalCost.toFixed(2)}`);
  doc.moveDown();

  // Top assets by value
  doc.fontSize(14).text('Top Assets by Value');
  data.assetsByValue.slice(0, 10).forEach((asset: any) => {
    doc.fontSize(10).text(`${asset.name}: $${asset.totalValue.toFixed(2)}`);
  });
  doc.moveDown();

  // Cost by category
  doc.fontSize(14).text('Cost by Category');
  doc.fontSize(12).text('Assets:', { underline: true });
  Object.entries(data.costByCategory.assets).forEach(([category, cost]) => {
    doc.fontSize(10).text(`${category}: $${(cost as number).toFixed(2)}`);
  });
  doc.moveDown();
  
  doc.fontSize(12).text('Maintenance:', { underline: true });
  Object.entries(data.costByCategory.maintenance).forEach(([category, cost]) => {
    doc.fontSize(10).text(`${category}: $${(cost as number).toFixed(2)}`);
  });
}

function generateUsageStatisticsPDFContent(doc: PDFKit.PDFDocument, data: any): void {
  doc.fontSize(16).text('Usage Statistics Overview', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Users: ${data.overview.totalUsers}`);
  doc.text(`Total Assets: ${data.overview.totalAssets}`);
  doc.text(`Total Tasks: ${data.overview.totalTasks}`);
  doc.text(`Completed Tasks: ${data.overview.completedTasks}`);
  doc.text(`Task Completion Rate: ${data.overview.taskCompletionRate.toFixed(1)}%`);
  doc.text(`Average Task Cost: $${data.overview.averageTaskCost.toFixed(2)}`);
  doc.moveDown();

  // Users by role
  doc.fontSize(14).text('Users by Role');
  Object.entries(data.overview.usersByRole).forEach(([role, count]) => {
    doc.fontSize(10).text(`${role}: ${count}`);
  });
  doc.moveDown();

  // Top locations
  doc.fontSize(14).text('Top Locations by Asset Count');
  data.locationUtilization.slice(0, 10).forEach((loc: any) => {
    doc.fontSize(10).text(`${loc.name}: ${loc.assetCount} assets`);
  });
  doc.moveDown();

  // Activity summary
  doc.fontSize(14).text('Activity Summary');
  doc.fontSize(10).text(`Total Activities: ${data.activitySummary.totalActivities}`);
  doc.moveDown();
  
  doc.fontSize(12).text('Top Active Users:');
  data.activitySummary.topUsers.forEach(([user, count]: [string, number]) => {
    doc.fontSize(10).text(`${user}: ${count} activities`);
  });
}

async function generateCSVReport(filePath: string, data: any, reportType: string): Promise<void> {
  let csvData: any[] = [];
  let headers: string[] = [];

  switch (reportType) {
    case 'asset-report':
      headers = ['Name', 'Category', 'Status', 'Serial Number', 'Location', 'Purchase Price', 'Total Value'];
      csvData = data.assets.map((asset: any) => ({
        Name: asset.name,
        Category: asset.category,
        Status: asset.status,
        'Serial Number': asset.serialNumber || '',
        Location: asset.location?.name || '',
        'Purchase Price': asset.purchasePrice || 0,
        'Total Value': asset.totalValue,
      }));
      break;

    case 'maintenance-report':
      headers = ['Title', 'Status', 'Priority', 'Due Date', 'Asset', 'Estimated Cost', 'Actual Cost'];
      csvData = data.tasks.map((task: any) => ({
        Title: task.title,
        Status: task.status,
        Priority: task.priority,
        'Due Date': task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '',
        Asset: task.asset?.name || '',
        'Estimated Cost': task.estimatedCost || 0,
        'Actual Cost': task.actualCost || 0,
      }));
      break;

    default:
      // For complex reports, flatten the data structure
      csvData = [data];
      headers = Object.keys(data);
  }

  const csvStringifier = createObjectCsvStringifier({
    header: headers.map((h) => ({ id: h, title: h })),
  });

  const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvData);
  await fs.writeFile(filePath, csvContent);
}

async function generateExcelReport(
  filePath: string,
  data: any,
  reportType: string,
  reportParams: any,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Asset Manager';
  workbook.created = new Date();

  switch (reportType) {
    case 'asset-report':
      await generateAssetExcelReport(workbook, data);
      break;
    case 'maintenance-report':
      await generateMaintenanceExcelReport(workbook, data);
      break;
    case 'cost-analysis':
      await generateCostAnalysisExcelReport(workbook, data);
      break;
    case 'usage-statistics':
      await generateUsageStatisticsExcelReport(workbook, data);
      break;
  }

  await workbook.xlsx.writeFile(filePath);
}

async function generateAssetExcelReport(workbook: ExcelJS.Workbook, data: any): Promise<void> {
  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
  ];

  summarySheet.addRows([
    { metric: 'Total Assets', value: data.summary.totalAssets },
    { metric: 'Total Value', value: `$${data.summary.totalValue.toFixed(2)}` },
    { metric: 'Warranty Expiring Soon', value: data.summary.warrantyExpiring },
  ]);

  // Assets sheet
  const assetsSheet = workbook.addWorksheet('Assets');
  assetsSheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Serial Number', key: 'serialNumber', width: 20 },
    { header: 'Model Number', key: 'modelNumber', width: 20 },
    { header: 'Manufacturer', key: 'manufacturer', width: 20 },
    { header: 'Location', key: 'location', width: 25 },
    { header: 'Purchase Date', key: 'purchaseDate', width: 15 },
    { header: 'Purchase Price', key: 'purchasePrice', width: 15 },
    { header: 'Total Value', key: 'totalValue', width: 15 },
    { header: 'Warranty Expiry', key: 'warrantyExpiry', width: 15 },
  ];

  data.assets.forEach((asset: any) => {
    assetsSheet.addRow({
      name: asset.name,
      category: asset.category,
      status: asset.status,
      serialNumber: asset.serialNumber || '',
      modelNumber: asset.modelNumber || '',
      manufacturer: asset.manufacturer || '',
      location: asset.location?.name || '',
      purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '',
      purchasePrice: asset.purchasePrice || 0,
      totalValue: asset.totalValue,
      warrantyExpiry: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : '',
    });
  });

  // Apply formatting
  assetsSheet.getRow(1).font = { bold: true };
  assetsSheet.autoFilter = {
    from: 'A1',
    to: `K${assetsSheet.rowCount}`,
  };
}

async function generateMaintenanceExcelReport(workbook: ExcelJS.Workbook, data: any): Promise<void> {
  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
  ];

  summarySheet.addRows([
    { metric: 'Total Tasks', value: data.summary.totalTasks },
    { metric: 'Overdue', value: data.summary.overdue },
    { metric: 'Due This Week', value: data.summary.dueThisWeek },
    { metric: 'Completion Rate', value: `${data.summary.completionRate.toFixed(1)}%` },
    { metric: 'Estimated Cost', value: `$${data.summary.estimatedCost.toFixed(2)}` },
    { metric: 'Actual Cost', value: `$${data.summary.actualCost.toFixed(2)}` },
  ]);

  // Tasks sheet
  const tasksSheet = workbook.addWorksheet('Tasks');
  tasksSheet.columns = [
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Due Date', key: 'dueDate', width: 15 },
    { header: 'Asset', key: 'asset', width: 30 },
    { header: 'Location', key: 'location', width: 25 },
    { header: 'Assigned To', key: 'assignedTo', width: 30 },
    { header: 'Estimated Cost', key: 'estimatedCost', width: 15 },
    { header: 'Actual Cost', key: 'actualCost', width: 15 },
  ];

  data.tasks.forEach((task: any) => {
    tasksSheet.addRow({
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '',
      asset: task.asset?.name || '',
      location: task.asset?.location?.name || '',
      assignedTo: task.assignments?.map((a: any) => `${a.user.firstName} ${a.user.lastName}`).join(', ') || '',
      estimatedCost: task.estimatedCost || 0,
      actualCost: task.actualCost || 0,
    });
  });

  tasksSheet.getRow(1).font = { bold: true };
  tasksSheet.autoFilter = {
    from: 'A1',
    to: `I${tasksSheet.rowCount}`,
  };
}

async function generateCostAnalysisExcelReport(workbook: ExcelJS.Workbook, data: any): Promise<void> {
  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Cost Category', key: 'category', width: 30 },
    { header: 'Amount', key: 'amount', width: 20 },
  ];

  summarySheet.addRows([
    { category: 'Total Asset Cost', amount: `$${data.summary.totalAssetCost.toFixed(2)}` },
    { category: 'Total Maintenance Cost', amount: `$${data.summary.totalMaintenanceCost.toFixed(2)}` },
    { category: 'Total Cost', amount: `$${data.summary.totalCost.toFixed(2)}` },
  ]);

  // Top assets sheet
  const topAssetsSheet = workbook.addWorksheet('Top Assets by Value');
  topAssetsSheet.columns = [
    { header: 'Asset Name', key: 'name', width: 40 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Purchase Price', key: 'purchasePrice', width: 20 },
    { header: 'Total Value', key: 'totalValue', width: 20 },
  ];

  data.assetsByValue.forEach((asset: any) => {
    topAssetsSheet.addRow({
      name: asset.name,
      category: asset.category,
      purchasePrice: asset.purchasePrice || 0,
      totalValue: asset.totalValue,
    });
  });

  topAssetsSheet.getRow(1).font = { bold: true };
}

async function generateUsageStatisticsExcelReport(workbook: ExcelJS.Workbook, data: any): Promise<void> {
  // Overview sheet
  const overviewSheet = workbook.addWorksheet('Overview');
  overviewSheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
  ];

  const overviewRows = [
    { metric: 'Total Users', value: data.overview.totalUsers },
    { metric: 'Total Assets', value: data.overview.totalAssets },
    { metric: 'Total Tasks', value: data.overview.totalTasks },
    { metric: 'Completed Tasks', value: data.overview.completedTasks },
    { metric: 'Task Completion Rate', value: `${data.overview.taskCompletionRate.toFixed(1)}%` },
    { metric: 'Average Task Cost', value: `$${data.overview.averageTaskCost.toFixed(2)}` },
  ];

  overviewSheet.addRows(overviewRows);

  // Location utilization sheet
  const locationSheet = workbook.addWorksheet('Location Utilization');
  locationSheet.columns = [
    { header: 'Location', key: 'name', width: 40 },
    { header: 'Asset Count', key: 'assetCount', width: 20 },
  ];

  data.locationUtilization.forEach((loc: any) => {
    locationSheet.addRow({
      name: loc.name,
      assetCount: loc.assetCount,
    });
  });

  locationSheet.getRow(1).font = { bold: true };
}

function getReportTitle(reportType: string): string {
  switch (reportType) {
    case 'asset-report':
      return 'Asset Report';
    case 'maintenance-report':
      return 'Maintenance Report';
    case 'cost-analysis':
      return 'Cost Analysis Report';
    case 'usage-statistics':
      return 'Usage Statistics Report';
    default:
      return 'Report';
  }
}

function mapReportType(type: string): string {
  switch (type) {
    case 'asset-report':
      return 'asset';
    case 'maintenance-report':
      return 'task';
    case 'usage-statistics':
      return 'user';
    case 'cost-analysis':
      return 'custom';
    default:
      return type;
  }
}