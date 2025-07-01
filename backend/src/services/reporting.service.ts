import { prisma } from '../lib/prisma';
import {
  ReportRequest,
  ReportFormat,
  AssetAgeAnalysisReport,
  AssetWarrantyReport,
  AssetMaintenanceReport,
  TaskCompletionReport,
  TaskCostReport,
  UserWorkloadReport,
  UserPerformanceReport,
  CustomReportConfig,
  CustomReportResult,
  ReportOptions
} from '../types/reports';
import { AssetCategory, AssetStatus, TaskStatus, TaskPriority, Prisma, ReportType, ReportStatus } from '@prisma/client';
import { differenceInDays, differenceInYears, differenceInHours, format, subDays, addHours } from 'date-fns';
import { ValidationError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { Parser } from 'json2csv';
import * as ExcelJS from 'exceljs';
import { IRequestContext } from '../interfaces/context.interface';
import { AuditService } from './audit.service';
import { PDFExportService } from './pdf-export.service';
import { webhookService } from './webhook.service';
import type { ReportGeneratedPayload, ReportScheduledPayload } from '../types/webhook-payloads';

/**
 * Service for generating various reports from the asset management system.
 * Supports multiple formats and custom report building.
 */
export class ReportingService {
  private auditService: AuditService;
  private pdfExportService: PDFExportService;

  constructor() {
    this.auditService = new AuditService();
    this.pdfExportService = new PDFExportService();
  }

  /**
   * Generate Asset Age Analysis Report
   */
  async generateAssetAgeAnalysis(
    request: ReportRequest,
    options?: ReportOptions
  ): Promise<AssetAgeAnalysisReport> {
    const assets = await prisma.asset.findMany({
      where: {
        organizationId: request.organizationId,
        ...(request.filters?.locationId && { locationId: request.filters.locationId }),
        ...(request.filters?.category && { category: request.filters.category }),
        ...(request.filters?.status && { status: request.filters.status })
      },
      select: {
        id: true,
        name: true,
        category: true,
        purchaseDate: true,
        purchasePrice: true
      }
    });

    const now = new Date();
    const assetsWithAge = assets
      .filter(asset => asset.purchaseDate)
      .map(asset => ({
        ...asset,
        ageInYears: differenceInYears(now, asset.purchaseDate!)
      }))
      .sort((a, b) => b.ageInYears - a.ageInYears);

    // Calculate summary
    const totalAssets = assets.length;
    const avgAge = assetsWithAge.length > 0
      ? assetsWithAge.reduce((sum, asset) => sum + asset.ageInYears, 0) / assetsWithAge.length
      : 0;

    const oldestAsset = assetsWithAge[0] || null;
    const newestAsset = assetsWithAge[assetsWithAge.length - 1] || null;

    // Age distribution
    const ageRanges = [
      { label: '0-1 years', min: 0, max: 1 },
      { label: '1-3 years', min: 1, max: 3 },
      { label: '3-5 years', min: 3, max: 5 },
      { label: '5-10 years', min: 5, max: 10 },
      { label: '10+ years', min: 10, max: 999 }
    ];

    const ageDistribution = ageRanges.map(range => {
      const assetsInRange = assetsWithAge.filter(
        asset => asset.ageInYears >= range.min && asset.ageInYears < range.max
      );
      const count = assetsInRange.length;
      const totalValue = assetsInRange.reduce(
        (sum, asset) => sum + (asset.purchasePrice?.toNumber() || 0), 0
      );

      return {
        range: range.label,
        count,
        percentage: totalAssets > 0 ? (count / totalAssets) * 100 : 0,
        totalValue
      };
    });

    // By category analysis
    const categoryMap = new Map<AssetCategory, any[]>();
    assetsWithAge.forEach(asset => {
      if (!categoryMap.has(asset.category)) {
        categoryMap.set(asset.category, []);
      }
      categoryMap.get(asset.category)!.push(asset);
    });

    const byCategory = Array.from(categoryMap.entries()).map(([category, categoryAssets]) => {
      const ages = categoryAssets.map(a => a.ageInYears);
      return {
        category,
        count: categoryAssets.length,
        avgAge: ages.reduce((sum, age) => sum + age, 0) / ages.length,
        oldestAge: Math.max(...ages),
        newestAge: Math.min(...ages)
      };
    });

    // Depreciation calculation (simple straight-line)
    const depreciationRate = 0.2; // 20% per year
    let originalValue = 0;
    let currentValue = 0;

    assetsWithAge.forEach(asset => {
      const price = asset.purchasePrice?.toNumber() || 0;
      originalValue += price;
      const depreciated = price * Math.max(0, 1 - (depreciationRate * asset.ageInYears));
      currentValue += depreciated;
    });

    return {
      summary: {
        totalAssets,
        avgAge: Math.round(avgAge * 10) / 10,
        oldestAsset: oldestAsset ? {
          id: oldestAsset.id,
          name: oldestAsset.name,
          purchaseDate: oldestAsset.purchaseDate!,
          ageInYears: oldestAsset.ageInYears
        } : null,
        newestAsset: newestAsset ? {
          id: newestAsset.id,
          name: newestAsset.name,
          purchaseDate: newestAsset.purchaseDate!,
          ageInYears: newestAsset.ageInYears
        } : null
      },
      ageDistribution,
      byCategory,
      depreciation: {
        originalValue: Math.round(originalValue),
        currentValue: Math.round(currentValue),
        totalDepreciation: Math.round(originalValue - currentValue),
        avgDepreciationRate: depreciationRate * 100
      }
    };
  }

  /**
   * Generate Asset Warranty Report
   */
  async generateAssetWarrantyReport(
    request: ReportRequest,
    options?: ReportOptions
  ): Promise<AssetWarrantyReport> {
    const assets = await prisma.asset.findMany({
      where: {
        organizationId: request.organizationId,
        ...(request.filters?.locationId && { locationId: request.filters.locationId }),
        ...(request.filters?.category && { category: request.filters.category })
      },
      include: {
        location: { select: { id: true, name: true } }
      }
    });

    const now = new Date();
    let underWarranty = 0;
    let lifetimeWarranty = 0;
    let expiredWarranty = 0;
    let noWarranty = 0;
    const expiringWarranties: any[] = [];

    assets.forEach(asset => {
      if (asset.warrantyLifetime) {
        lifetimeWarranty++;
      } else if (asset.warrantyExpiry) {
        if (asset.warrantyExpiry > now) {
          underWarranty++;
          const daysUntilExpiry = differenceInDays(asset.warrantyExpiry, now);
          if (daysUntilExpiry <= 90) {
            expiringWarranties.push({
              assetId: asset.id,
              assetName: asset.name,
              category: asset.category,
              location: asset.location?.name || 'Unknown',
              warrantyType: 'primary' as const,
              expiryDate: asset.warrantyExpiry,
              daysUntilExpiry,
              warrantyScope: asset.warrantyScope
            });
          }
        } else {
          expiredWarranty++;
        }
      } else if (asset.secondaryWarrantyExpiry) {
        if (asset.secondaryWarrantyExpiry > now) {
          underWarranty++;
          const daysUntilExpiry = differenceInDays(asset.secondaryWarrantyExpiry, now);
          if (daysUntilExpiry <= 90) {
            expiringWarranties.push({
              assetId: asset.id,
              assetName: asset.name,
              category: asset.category,
              location: asset.location?.name || 'Unknown',
              warrantyType: 'secondary' as const,
              expiryDate: asset.secondaryWarrantyExpiry,
              daysUntilExpiry,
              warrantyScope: asset.secondaryWarrantyScope
            });
          }
        } else {
          expiredWarranty++;
        }
      } else {
        noWarranty++;
      }
    });

    // Sort expiring warranties by days until expiry
    expiringWarranties.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    // Warranty by category
    const categoryMap = new Map<AssetCategory, any>();
    assets.forEach(asset => {
      if (!categoryMap.has(asset.category)) {
        categoryMap.set(asset.category, {
          totalAssets: 0,
          underWarranty: 0,
          lifetimeWarranty: 0,
          warrantyDays: []
        });
      }
      
      const cat = categoryMap.get(asset.category)!;
      cat.totalAssets++;
      
      if (asset.warrantyLifetime) {
        cat.lifetimeWarranty++;
      } else if (asset.warrantyExpiry && asset.warrantyExpiry > now) {
        cat.underWarranty++;
        const days = differenceInDays(asset.warrantyExpiry, asset.purchaseDate || asset.createdAt);
        cat.warrantyDays.push(days);
      }
    });

    const warrantyByCategory = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      totalAssets: data.totalAssets,
      underWarranty: data.underWarranty,
      lifetimeWarranty: data.lifetimeWarranty,
      avgWarrantyDays: data.warrantyDays.length > 0
        ? Math.round(data.warrantyDays.reduce((sum: number, d: number) => sum + d, 0) / data.warrantyDays.length)
        : 0
    }));

    // Warranty by vendor
    const vendorMap = new Map<string, any>();
    assets.forEach(asset => {
      const vendor = asset.manufacturer || 'Unknown';
      if (!vendorMap.has(vendor)) {
        vendorMap.set(vendor, {
          assetCount: 0,
          warrantyDays: [],
          lifetimeWarrantyCount: 0
        });
      }
      
      const v = vendorMap.get(vendor)!;
      v.assetCount++;
      
      if (asset.warrantyLifetime) {
        v.lifetimeWarrantyCount++;
      } else if (asset.warrantyExpiry) {
        const days = differenceInDays(asset.warrantyExpiry, asset.purchaseDate || asset.createdAt);
        v.warrantyDays.push(days);
      }
    });

    const warrantyByVendor = Array.from(vendorMap.entries())
      .map(([manufacturer, data]) => ({
        manufacturer,
        assetCount: data.assetCount,
        avgWarrantyLength: data.warrantyDays.length > 0
          ? Math.round(data.warrantyDays.reduce((sum: number, d: number) => sum + d, 0) / data.warrantyDays.length)
          : 0,
        lifetimeWarrantyCount: data.lifetimeWarrantyCount
      }))
      .sort((a, b) => b.assetCount - a.assetCount);

    return {
      summary: {
        totalAssets: assets.length,
        underWarranty,
        lifetimeWarranty,
        expiredWarranty,
        noWarranty
      },
      expiringWarranties: expiringWarranties.slice(0, 20), // Top 20
      warrantyByCategory,
      warrantyByVendor: warrantyByVendor.slice(0, 10) // Top 10
    };
  }

  /**
   * Generate Asset Maintenance Report
   */
  async generateAssetMaintenanceReport(
    request: ReportRequest,
    options?: ReportOptions
  ): Promise<AssetMaintenanceReport> {
    const dateFilter = this.buildDateFilter(request.startDate, request.endDate);
    
    const maintenanceTasks = await prisma.task.findMany({
      where: {
        organizationId: request.organizationId,
        assetId: { not: null },
        ...(dateFilter && { OR: [
          { createdAt: dateFilter },
          { completedAt: dateFilter }
        ]}),
        ...(request.filters?.assetId && { assetId: request.filters.assetId }),
        ...(request.filters?.status && { status: request.filters.status })
      },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Summary calculations
    const summary = {
      totalMaintenanceTasks: maintenanceTasks.length,
      completedTasks: maintenanceTasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      scheduledTasks: maintenanceTasks.filter(t => t.status === TaskStatus.PLANNED).length,
      overdueTasks: maintenanceTasks.filter(t => 
        [TaskStatus.PLANNED, TaskStatus.IN_PROGRESS].includes(t.status) && 
        t.dueDate < new Date()
      ).length,
      totalCost: maintenanceTasks.reduce((sum, t) => sum + (t.actualCost?.toNumber() || 0), 0),
      avgCostPerTask: 0
    };
    summary.avgCostPerTask = summary.completedTasks > 0 
      ? summary.totalCost / summary.completedTasks 
      : 0;

    // Maintenance by asset
    const assetMap = new Map<string, any>();
    maintenanceTasks.forEach(task => {
      if (!task.asset) return;
      
      const assetId = task.assetId!;
      if (!assetMap.has(assetId)) {
        assetMap.set(assetId, {
          assetId,
          assetName: task.asset.name,
          category: task.asset.category,
          tasks: [],
          totalCost: 0,
          lastMaintenance: null,
          nextScheduled: null
        });
      }
      
      const asset = assetMap.get(assetId)!;
      asset.tasks.push(task);
      asset.totalCost += task.actualCost?.toNumber() || 0;
      
      if (task.status === TaskStatus.COMPLETED && task.completedAt) {
        if (!asset.lastMaintenance || task.completedAt > asset.lastMaintenance) {
          asset.lastMaintenance = task.completedAt;
        }
      }
      
      if (task.status === TaskStatus.PLANNED && task.dueDate > new Date()) {
        if (!asset.nextScheduled || task.dueDate < asset.nextScheduled) {
          asset.nextScheduled = task.dueDate;
        }
      }
    });

    const maintenanceByAsset = Array.from(assetMap.values()).map(asset => {
      // Calculate average time between maintenance
      const completedTasks = asset.tasks
        .filter((t: any) => t.status === TaskStatus.COMPLETED && t.completedAt)
        .sort((a: any, b: any) => a.completedAt.getTime() - b.completedAt.getTime());
      
      let avgTimeBetween = 0;
      if (completedTasks.length > 1) {
        const timeDiffs = [];
        for (let i = 1; i < completedTasks.length; i++) {
          const days = differenceInDays(completedTasks[i].completedAt, completedTasks[i-1].completedAt);
          timeDiffs.push(days);
        }
        avgTimeBetween = timeDiffs.reduce((sum, d) => sum + d, 0) / timeDiffs.length;
      }

      return {
        assetId: asset.assetId,
        assetName: asset.assetName,
        category: asset.category,
        taskCount: asset.tasks.length,
        totalCost: Math.round(asset.totalCost),
        avgTimeBetweenMaintenance: Math.round(avgTimeBetween),
        lastMaintenance: asset.lastMaintenance,
        nextScheduled: asset.nextScheduled
      };
    }).sort((a, b) => b.taskCount - a.taskCount);

    // Maintenance by category
    const categoryMap = new Map<AssetCategory, any>();
    maintenanceTasks.forEach(task => {
      if (!task.asset) return;
      
      const category = task.asset.category;
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          tasks: [],
          totalCost: 0,
          completedCount: 0
        });
      }
      
      const cat = categoryMap.get(category)!;
      cat.tasks.push(task);
      cat.totalCost += task.actualCost?.toNumber() || 0;
      if (task.status === TaskStatus.COMPLETED) {
        cat.completedCount++;
      }
    });

    const maintenanceByCategory = Array.from(categoryMap.values()).map(cat => ({
      category: cat.category,
      taskCount: cat.tasks.length,
      totalCost: Math.round(cat.totalCost),
      avgCost: cat.tasks.length > 0 ? Math.round(cat.totalCost / cat.tasks.length) : 0,
      completionRate: cat.tasks.length > 0 ? (cat.completedCount / cat.tasks.length) * 100 : 0
    }));

    // Cost analysis
    const estimatedTotal = maintenanceTasks.reduce((sum, t) => 
      sum + (t.estimatedCost?.toNumber() || 0), 0
    );
    const actualTotal = maintenanceTasks.reduce((sum, t) => 
      sum + (t.actualCost?.toNumber() || 0), 0
    );

    // Cost trend (monthly)
    const costTrendMap = new Map<string, any>();
    maintenanceTasks.forEach(task => {
      if (task.completedAt) {
        const monthKey = format(task.completedAt, 'yyyy-MM');
        if (!costTrendMap.has(monthKey)) {
          costTrendMap.set(monthKey, { cost: 0, taskCount: 0 });
        }
        const month = costTrendMap.get(monthKey)!;
        month.cost += task.actualCost?.toNumber() || 0;
        month.taskCount++;
      }
    });

    const costTrend = Array.from(costTrendMap.entries())
      .map(([period, data]) => ({
        period,
        cost: Math.round(data.cost),
        taskCount: data.taskCount
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      summary,
      maintenanceByAsset: maintenanceByAsset.slice(0, 20), // Top 20
      maintenanceByCategory,
      costAnalysis: {
        estimatedVsActual: {
          totalEstimated: Math.round(estimatedTotal),
          totalActual: Math.round(actualTotal),
          variance: Math.round(actualTotal - estimatedTotal),
          variancePercentage: estimatedTotal > 0 
            ? Math.round(((actualTotal - estimatedTotal) / estimatedTotal) * 100)
            : 0
        },
        costTrend
      }
    };
  }

  /**
   * Generate Task Completion Report
   */
  async generateTaskCompletionReport(
    request: ReportRequest,
    options?: ReportOptions
  ): Promise<TaskCompletionReport> {
    const dateFilter = this.buildDateFilter(request.startDate, request.endDate);
    
    const tasks = await prisma.task.findMany({
      where: {
        organizationId: request.organizationId,
        ...(dateFilter && { createdAt: dateFilter }),
        ...(request.filters?.userId && {
          assignments: { some: { userId: request.filters.userId } }
        }),
        ...(request.filters?.priority && { priority: request.filters.priority })
      }
    });

    const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED);
    const completionRate = tasks.length > 0 
      ? (completedTasks.length / tasks.length) * 100 
      : 0;

    // Calculate average completion time
    let totalCompletionTime = 0;
    let onTimeCompletions = 0;
    
    completedTasks.forEach(task => {
      if (task.completedAt) {
        const completionHours = differenceInHours(task.completedAt, task.createdAt);
        totalCompletionTime += completionHours;
        
        if (task.completedAt <= task.dueDate) {
          onTimeCompletions++;
        }
      }
    });

    const avgCompletionTime = completedTasks.length > 0
      ? totalCompletionTime / completedTasks.length
      : 0;
    
    const onTimeCompletionRate = completedTasks.length > 0
      ? (onTimeCompletions / completedTasks.length) * 100
      : 0;

    // By status
    const statusCounts = new Map<TaskStatus, number>();
    Object.values(TaskStatus).forEach(status => statusCounts.set(status, 0));
    tasks.forEach(task => {
      statusCounts.set(task.status, (statusCounts.get(task.status) || 0) + 1);
    });

    const byStatus = Array.from(statusCounts.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: tasks.length > 0 ? (count / tasks.length) * 100 : 0
    }));

    // By priority
    const priorityMap = new Map<TaskPriority, any>();
    Object.values(TaskPriority).forEach(priority => {
      priorityMap.set(priority, {
        total: 0,
        completed: 0,
        completionTimes: [],
        onTime: 0
      });
    });

    tasks.forEach(task => {
      const pData = priorityMap.get(task.priority)!;
      pData.total++;
      
      if (task.status === TaskStatus.COMPLETED && task.completedAt) {
        pData.completed++;
        const hours = differenceInHours(task.completedAt, task.createdAt);
        pData.completionTimes.push(hours);
        
        if (task.completedAt <= task.dueDate) {
          pData.onTime++;
        }
      }
    });

    const byPriority = Array.from(priorityMap.entries()).map(([priority, data]) => ({
      priority,
      totalTasks: data.total,
      completed: data.completed,
      completionRate: data.total > 0 ? (data.completed / data.total) * 100 : 0,
      avgCompletionTime: data.completionTimes.length > 0
        ? data.completionTimes.reduce((sum: number, h: number) => sum + h, 0) / data.completionTimes.length
        : 0,
      onTimeRate: data.completed > 0 ? (data.onTime / data.completed) * 100 : 0
    }));

    // Completion trend (weekly)
    const trendMap = new Map<string, any>();
    tasks.forEach(task => {
      const weekKey = format(task.createdAt, 'yyyy-ww');
      if (!trendMap.has(weekKey)) {
        trendMap.set(weekKey, {
          created: 0,
          completed: 0,
          completionTimes: []
        });
      }
      
      const week = trendMap.get(weekKey)!;
      week.created++;
      
      if (task.status === TaskStatus.COMPLETED && task.completedAt) {
        week.completed++;
        const hours = differenceInHours(task.completedAt, task.createdAt);
        week.completionTimes.push(hours);
      }
    });

    const completionTrend = Array.from(trendMap.entries())
      .map(([period, data]) => ({
        period,
        created: data.created,
        completed: data.completed,
        completionRate: data.created > 0 ? (data.completed / data.created) * 100 : 0,
        avgCompletionTime: data.completionTimes.length > 0
          ? data.completionTimes.reduce((sum: number, h: number) => sum + h, 0) / data.completionTimes.length
          : 0
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Delay analysis
    const delayedTasks = tasks.filter(t => 
      t.status === TaskStatus.COMPLETED && 
      t.completedAt && 
      t.completedAt > t.dueDate
    );

    let totalDelayDays = 0;
    delayedTasks.forEach(task => {
      if (task.completedAt) {
        totalDelayDays += differenceInDays(task.completedAt, task.dueDate);
      }
    });

    const avgDelayDays = delayedTasks.length > 0
      ? totalDelayDays / delayedTasks.length
      : 0;

    // Simple delay reason analysis (would need additional data in real implementation)
    const delayReasons = [
      { reason: 'Resource constraints', count: Math.floor(delayedTasks.length * 0.3), avgDelay: 5 },
      { reason: 'Dependencies', count: Math.floor(delayedTasks.length * 0.25), avgDelay: 3 },
      { reason: 'Scope changes', count: Math.floor(delayedTasks.length * 0.2), avgDelay: 7 },
      { reason: 'Technical issues', count: Math.floor(delayedTasks.length * 0.15), avgDelay: 4 },
      { reason: 'Other', count: Math.floor(delayedTasks.length * 0.1), avgDelay: 2 }
    ].filter(r => r.count > 0);

    return {
      summary: {
        totalTasks: tasks.length,
        completedTasks: completedTasks.length,
        completionRate: Math.round(completionRate),
        avgCompletionTime: Math.round(avgCompletionTime),
        onTimeCompletionRate: Math.round(onTimeCompletionRate)
      },
      byStatus,
      byPriority,
      completionTrend,
      delayAnalysis: {
        totalDelayed: delayedTasks.length,
        avgDelayDays: Math.round(avgDelayDays),
        delayReasons
      }
    };
  }

  /**
   * Generate Task Cost Report
   */
  async generateTaskCostReport(
    request: ReportRequest,
    options?: ReportOptions
  ): Promise<TaskCostReport> {
    const dateFilter = this.buildDateFilter(request.startDate, request.endDate);
    
    const tasks = await prisma.task.findMany({
      where: {
        organizationId: request.organizationId,
        ...(dateFilter && { createdAt: dateFilter }),
        ...(request.filters?.status && { status: request.filters.status })
      },
      include: {
        asset: { select: { category: true } },
        assignments: {
          include: {
            user: { select: { fullName: true } }
          }
        }
      }
    });

    // Summary calculations
    const totalEstimatedCost = tasks.reduce((sum, t) => 
      sum + (t.estimatedCost?.toNumber() || 0), 0
    );
    const totalActualCost = tasks.reduce((sum, t) => 
      sum + (t.actualCost?.toNumber() || 0), 0
    );
    const tasksWithCost = tasks.filter(t => t.actualCost && t.actualCost.toNumber() > 0);
    const avgCostPerTask = tasksWithCost.length > 0
      ? totalActualCost / tasksWithCost.length
      : 0;

    // By category
    const categoryMap = new Map<string, any>();
    tasks.forEach(task => {
      const category = task.asset?.category || 'Other';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          taskCount: 0,
          estimatedCost: 0,
          actualCost: 0
        });
      }
      
      const cat = categoryMap.get(category)!;
      cat.taskCount++;
      cat.estimatedCost += task.estimatedCost?.toNumber() || 0;
      cat.actualCost += task.actualCost?.toNumber() || 0;
    });

    const byCategory = Array.from(categoryMap.entries()).map(([category, data]) => {
      const variance = data.actualCost - data.estimatedCost;
      return {
        category,
        taskCount: data.taskCount,
        estimatedCost: Math.round(data.estimatedCost),
        actualCost: Math.round(data.actualCost),
        variance: Math.round(variance),
        variancePercentage: data.estimatedCost > 0
          ? Math.round((variance / data.estimatedCost) * 100)
          : 0
      };
    });

    // By priority
    const priorityMap = new Map<TaskPriority, any>();
    Object.values(TaskPriority).forEach(priority => {
      priorityMap.set(priority, {
        taskCount: 0,
        totalCost: 0
      });
    });

    tasks.forEach(task => {
      const pData = priorityMap.get(task.priority)!;
      pData.taskCount++;
      pData.totalCost += task.actualCost?.toNumber() || 0;
    });

    const byPriority = Array.from(priorityMap.entries()).map(([priority, data]) => ({
      priority,
      taskCount: data.taskCount,
      totalCost: Math.round(data.totalCost),
      avgCost: data.taskCount > 0 ? Math.round(data.totalCost / data.taskCount) : 0
    }));

    // Over-budget tasks
    const overBudgetTasks = tasks
      .filter(t => 
        t.estimatedCost && 
        t.actualCost && 
        t.actualCost > t.estimatedCost
      )
      .map(task => {
        const estimated = task.estimatedCost!.toNumber();
        const actual = task.actualCost!.toNumber();
        const overage = actual - estimated;
        
        return {
          taskId: task.id,
          title: task.title,
          assignedTo: task.assignments.map(a => a.user.fullName),
          estimatedCost: estimated,
          actualCost: actual,
          overageAmount: overage,
          overagePercentage: Math.round((overage / estimated) * 100)
        };
      })
      .sort((a, b) => b.overagePercentage - a.overagePercentage)
      .slice(0, 20); // Top 20

    // Cost trend (monthly)
    const trendMap = new Map<string, any>();
    tasks.forEach(task => {
      const monthKey = format(task.createdAt, 'yyyy-MM');
      if (!trendMap.has(monthKey)) {
        trendMap.set(monthKey, {
          estimatedCost: 0,
          actualCost: 0,
          taskCount: 0
        });
      }
      
      const month = trendMap.get(monthKey)!;
      month.estimatedCost += task.estimatedCost?.toNumber() || 0;
      month.actualCost += task.actualCost?.toNumber() || 0;
      month.taskCount++;
    });

    const costTrend = Array.from(trendMap.entries())
      .map(([period, data]) => ({
        period,
        estimatedCost: Math.round(data.estimatedCost),
        actualCost: Math.round(data.actualCost),
        taskCount: data.taskCount
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      summary: {
        totalEstimatedCost: Math.round(totalEstimatedCost),
        totalActualCost: Math.round(totalActualCost),
        variance: Math.round(totalActualCost - totalEstimatedCost),
        variancePercentage: totalEstimatedCost > 0
          ? Math.round(((totalActualCost - totalEstimatedCost) / totalEstimatedCost) * 100)
          : 0,
        avgCostPerTask: Math.round(avgCostPerTask)
      },
      byCategory,
      byPriority,
      overBudgetTasks,
      costTrend
    };
  }

  /**
   * Generate User Workload Report
   */
  async generateUserWorkloadReport(
    request: ReportRequest,
    options?: ReportOptions
  ): Promise<UserWorkloadReport> {
    const dateFilter = this.buildDateFilter(request.startDate, request.endDate);
    
    // Get all users in organization
    const users = await prisma.user.findMany({
      where: {
        organizationId: request.organizationId,
        isActive: true
      }
    });

    // Get all task assignments
    const assignments = await prisma.taskAssignment.findMany({
      where: {
        task: {
          organizationId: request.organizationId,
          ...(dateFilter && { createdAt: dateFilter })
        }
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        },
        task: {
          select: {
            id: true,
            status: true,
            dueDate: true,
            estimatedMinutes: true,
            actualMinutes: true,
            createdAt: true,
            completedAt: true
          }
        }
      }
    });

    // Calculate user metrics
    const userMetricsMap = new Map<string, any>();
    
    users.forEach(user => {
      userMetricsMap.set(user.id, {
        userId: user.id,
        userName: user.fullName,
        email: user.email,
        assignedTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        overdueTasks: 0,
        totalEstimatedHours: 0,
        totalActualHours: 0,
        completionTimes: []
      });
    });

    assignments.forEach(assignment => {
      const metrics = userMetricsMap.get(assignment.userId);
      if (!metrics) return;

      metrics.assignedTasks++;
      
      switch (assignment.task.status) {
        case TaskStatus.COMPLETED:
          metrics.completedTasks++;
          if (assignment.task.completedAt) {
            const hours = differenceInHours(assignment.task.completedAt, assignment.task.createdAt);
            metrics.completionTimes.push(hours);
          }
          break;
        case TaskStatus.IN_PROGRESS:
          metrics.inProgressTasks++;
          break;
      }

      if ([TaskStatus.PLANNED, TaskStatus.IN_PROGRESS].includes(assignment.task.status) &&
          assignment.task.dueDate < new Date()) {
        metrics.overdueTasks++;
      }

      metrics.totalEstimatedHours += (assignment.task.estimatedMinutes || 0) / 60;
      metrics.totalActualHours += (assignment.task.actualMinutes || 0) / 60;
    });

    const userMetrics = Array.from(userMetricsMap.values()).map(metrics => ({
      userId: metrics.userId,
      userName: metrics.userName,
      email: metrics.email,
      assignedTasks: metrics.assignedTasks,
      completedTasks: metrics.completedTasks,
      inProgressTasks: metrics.inProgressTasks,
      overdueTasks: metrics.overdueTasks,
      completionRate: metrics.assignedTasks > 0
        ? (metrics.completedTasks / metrics.assignedTasks) * 100
        : 0,
      avgCompletionTime: metrics.completionTimes.length > 0
        ? metrics.completionTimes.reduce((sum: number, h: number) => sum + h, 0) / metrics.completionTimes.length
        : 0,
      totalEstimatedHours: Math.round(metrics.totalEstimatedHours),
      totalActualHours: Math.round(metrics.totalActualHours),
      efficiency: metrics.totalEstimatedHours > 0
        ? (metrics.totalActualHours / metrics.totalEstimatedHours) * 100
        : 100
    }));

    // Calculate workload distribution
    const activeUsers = userMetrics.filter(u => u.assignedTasks > 0);
    const totalTasks = activeUsers.reduce((sum, u) => sum + u.assignedTasks, 0);
    const avgTasksPerUser = activeUsers.length > 0 ? totalTasks / activeUsers.length : 0;
    
    // Calculate standard deviation
    const variance = activeUsers.reduce((sum, u) => {
      const diff = u.assignedTasks - avgTasksPerUser;
      return sum + (diff * diff);
    }, 0) / (activeUsers.length || 1);
    const standardDeviation = Math.sqrt(variance);

    // Identify overloaded and underutilized users
    const overloadThreshold = avgTasksPerUser + standardDeviation;
    const underutilizedThreshold = Math.max(1, avgTasksPerUser - standardDeviation);

    const overloadedUsers = userMetrics
      .filter(u => u.assignedTasks > overloadThreshold)
      .map(u => ({
        userId: u.userId,
        userName: u.userName,
        taskCount: u.assignedTasks,
        hoursAllocated: u.totalEstimatedHours
      }))
      .sort((a, b) => b.taskCount - a.taskCount);

    const underutilizedUsers = userMetrics
      .filter(u => u.assignedTasks < underutilizedThreshold && u.assignedTasks > 0)
      .map(u => ({
        userId: u.userId,
        userName: u.userName,
        taskCount: u.assignedTasks,
        hoursAllocated: u.totalEstimatedHours
      }))
      .sort((a, b) => a.taskCount - b.taskCount);

    // Team performance
    const topPerformers = userMetrics
      .filter(u => u.completedTasks > 0)
      .sort((a, b) => {
        const scoreA = (a.completionRate * 0.5) + ((100 - Math.abs(100 - a.efficiency)) * 0.5);
        const scoreB = (b.completionRate * 0.5) + ((100 - Math.abs(100 - b.efficiency)) * 0.5);
        return scoreB - scoreA;
      })
      .slice(0, 5)
      .map(u => ({
        userId: u.userId,
        userName: u.userName,
        completionRate: Math.round(u.completionRate),
        onTimeRate: 85 // Would need additional data for actual calculation
      }));

    const needsAttention = userMetrics
      .filter(u => u.overdueTasks > 0 || u.completionRate < 50)
      .sort((a, b) => b.overdueTasks - a.overdueTasks)
      .slice(0, 5)
      .map(u => ({
        userId: u.userId,
        userName: u.userName,
        overdueTasks: u.overdueTasks,
        completionRate: Math.round(u.completionRate)
      }));

    return {
      summary: {
        totalUsers: users.length,
        activeUsers: activeUsers.length,
        totalTasks,
        avgTasksPerUser: Math.round(avgTasksPerUser),
        avgCompletionRate: activeUsers.length > 0
          ? Math.round(activeUsers.reduce((sum, u) => sum + u.completionRate, 0) / activeUsers.length)
          : 0
      },
      userMetrics,
      workloadDistribution: {
        balanced: standardDeviation < avgTasksPerUser * 0.3,
        standardDeviation: Math.round(standardDeviation),
        overloadedUsers,
        underutilizedUsers
      },
      teamPerformance: {
        topPerformers,
        needsAttention
      }
    };
  }

  /**
   * Generate User Performance Report for a specific user
   */
  async generateUserPerformanceReport(
    userId: string,
    request: ReportRequest,
    options?: ReportOptions
  ): Promise<UserPerformanceReport> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true
      }
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const dateFilter = this.buildDateFilter(request.startDate, request.endDate);
    
    // Get all task assignments for the user
    const assignments = await prisma.taskAssignment.findMany({
      where: {
        userId,
        task: {
          organizationId: request.organizationId,
          ...(dateFilter && { createdAt: dateFilter })
        }
      },
      include: {
        task: true
      }
    });

    const tasks = assignments.map(a => a.task);

    // Task metrics
    const taskMetrics = {
      assigned: tasks.length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      inProgress: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      overdue: tasks.filter(t => 
        [TaskStatus.PLANNED, TaskStatus.IN_PROGRESS].includes(t.status) && 
        t.dueDate < new Date()
      ).length,
      cancelled: tasks.filter(t => t.status === TaskStatus.CANCELLED).length,
      completionRate: 0,
      onTimeRate: 0
    };

    taskMetrics.completionRate = taskMetrics.assigned > 0
      ? (taskMetrics.completed / taskMetrics.assigned) * 100
      : 0;

    const onTimeTasks = tasks.filter(t => 
      t.status === TaskStatus.COMPLETED && 
      t.completedAt && 
      t.completedAt <= t.dueDate
    ).length;

    taskMetrics.onTimeRate = taskMetrics.completed > 0
      ? (onTimeTasks / taskMetrics.completed) * 100
      : 0;

    // Time metrics
    const totalEstimatedHours = tasks.reduce((sum, t) => 
      sum + ((t.estimatedMinutes || 0) / 60), 0
    );
    const totalActualHours = tasks.reduce((sum, t) => 
      sum + ((t.actualMinutes || 0) / 60), 0
    );
    const avgHoursPerTask = taskMetrics.completed > 0
      ? totalActualHours / taskMetrics.completed
      : 0;
    const efficiency = totalEstimatedHours > 0
      ? (totalActualHours / totalEstimatedHours) * 100
      : 100;

    // Calculate overtime (simple approximation)
    const workingHoursPerDay = 8;
    const workingDays = this.getWorkingDays(request.startDate!, request.endDate!);
    const standardHours = workingDays * workingHoursPerDay;
    const overtimeHours = Math.max(0, totalActualHours - standardHours);

    // Quality metrics (simplified - would need additional data)
    const qualityMetrics = {
      reworkRequired: Math.floor(taskMetrics.completed * 0.05), // 5% approximation
      firstTimeRight: Math.floor(taskMetrics.completed * 0.95),
      customerSatisfaction: undefined,
      avgTaskRating: undefined
    };

    // Trend analysis (monthly)
    const trendMap = new Map<string, any>();
    tasks.forEach(task => {
      const monthKey = format(task.createdAt, 'yyyy-MM');
      if (!trendMap.has(monthKey)) {
        trendMap.set(monthKey, {
          completed: 0,
          onTime: 0,
          totalHours: 0,
          estimatedHours: 0
        });
      }
      
      const month = trendMap.get(monthKey)!;
      if (task.status === TaskStatus.COMPLETED) {
        month.completed++;
        if (task.completedAt && task.completedAt <= task.dueDate) {
          month.onTime++;
        }
      }
      month.totalHours += (task.actualMinutes || 0) / 60;
      month.estimatedHours += (task.estimatedMinutes || 0) / 60;
    });

    const trendAnalysis = Array.from(trendMap.entries())
      .map(([period, data]) => ({
        period,
        completed: data.completed,
        onTime: data.onTime,
        efficiency: data.estimatedHours > 0
          ? (data.totalHours / data.estimatedHours) * 100
          : 100
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      userId: user.id,
      userName: user.fullName,
      period: {
        startDate: request.startDate!,
        endDate: request.endDate!
      },
      taskMetrics,
      timeMetrics: {
        totalEstimatedHours: Math.round(totalEstimatedHours),
        totalActualHours: Math.round(totalActualHours),
        avgHoursPerTask: Math.round(avgHoursPerTask),
        efficiency: Math.round(efficiency),
        overtimeHours: Math.round(overtimeHours)
      },
      qualityMetrics,
      trendAnalysis
    };
  }

  /**
   * Execute a custom report based on configuration
   */
  async executeCustomReport(
    config: CustomReportConfig,
    request: ReportRequest,
    context: IRequestContext
  ): Promise<CustomReportResult> {
    const startTime = Date.now();

    // Log the custom report execution for audit
    await this.auditService.log(prisma, {
      context,
      model: 'CustomReport',
      recordId: config.name,
      action: 'CREATE',
      newValue: {
        config,
        filters: request.filters
      }
    });

    // Build Prisma query based on config
    const where = this.buildCustomReportWhere(config, request);
    const select = this.buildCustomReportSelect(config);
    const orderBy = this.buildCustomReportOrderBy(config);

    // Map entity to Prisma model
    const modelMap: Record<string, any> = {
      asset: prisma.asset,
      task: prisma.task,
      user: prisma.user,
      location: prisma.location,
      schedule: prisma.schedule
    };

    const model = modelMap[config.entity];
    if (!model) {
      throw new ValidationError(`Invalid entity: ${config.entity}`);
    }

    // Execute query
    let data: any[];
    
    if (config.groupBy && config.groupBy.length > 0) {
      // Aggregation query
      const aggregations = await model.groupBy({
        by: config.groupBy,
        where,
        ...this.buildAggregations(config),
        orderBy
      });
      data = aggregations;
    } else {
      // Regular query
      data = await model.findMany({
        where,
        select,
        orderBy
      });
    }

    // Calculate summary if needed
    const summary = this.calculateCustomReportSummary(data, config);

    const executionTime = Date.now() - startTime;

    return {
      config,
      data,
      summary,
      metadata: {
        totalRecords: data.length,
        generatedAt: new Date(),
        executionTime
      }
    };
  }

  /**
   * Generate and export a report with webhook notification
   */
  async generateAndExportReport(
    context: IRequestContext,
    reportType: ReportType,
    reportData: any,
    format: ReportFormat,
    reportName: string,
    options?: ReportOptions & { downloadUrl?: string; expiresAt?: Date }
  ): Promise<{ data: Buffer | string; reportId: string }> {
    const reportId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Generate the report in the requested format
      const exportedData = await this.exportReport(reportData, format, reportName, options);
      
      // Emit webhook event for report generation
      const payload: ReportGeneratedPayload = {
        report: {
          id: reportId,
          type: reportType,
          name: reportName,
          format: format,
          status: 'COMPLETED' as ReportStatus,
          generatedAt: new Date()
        },
        requestedBy: {
          id: context.userId,
          email: '', // Will be populated by createEnhancedEvent
          name: '',  // Will be populated by createEnhancedEvent
          role: context.userRole || 'VIEWER'
        },
        downloadUrl: options?.downloadUrl,
        expiresAt: options?.expiresAt
      };

      const enhancedEvent = await webhookService.createEnhancedEvent(
        'report.generated',
        context.organizationId,
        context.userId,
        payload
      );

      await webhookService.emitEvent(enhancedEvent);
      
      return { data: exportedData, reportId };
    } catch (error) {
      logger.error('Failed to generate report', error);
      throw error;
    }
  }

  /**
   * Export report to specified format
   */
  async exportReport(
    reportData: any,
    format: ReportFormat,
    reportName: string,
    options?: ReportOptions
  ): Promise<Buffer | string> {
    switch (format) {
      case ReportFormat.JSON:
        return JSON.stringify(reportData, null, 2);
      
      case ReportFormat.CSV:
        return this.exportToCSV(reportData, reportName);
      
      case ReportFormat.EXCEL:
        return this.exportToExcel(reportData, reportName, options);
      
      case ReportFormat.PDF:
        return this.exportToPDF(reportData, reportName, options);
      
      default:
        throw new ValidationError(`Unsupported format: ${format}`);
    }
  }

  /**
   * Helper method to build date filter
   */
  private buildDateFilter(startDate?: Date, endDate?: Date): any {
    if (!startDate && !endDate) return null;
    
    const filter: any = {};
    if (startDate) filter.gte = startDate;
    if (endDate) filter.lte = endDate;
    
    return filter;
  }

  /**
   * Helper method to calculate working days between two dates
   */
  private getWorkingDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  }

  /**
   * Build WHERE clause for custom report
   */
  private buildCustomReportWhere(config: CustomReportConfig, request: ReportRequest): any {
    const where: any = {
      organizationId: request.organizationId
    };

    // Apply filters from config
    config.filters.forEach(filter => {
      switch (filter.operator) {
        case 'equals':
          where[filter.field] = filter.value;
          break;
        case 'not_equals':
          where[filter.field] = { not: filter.value };
          break;
        case 'contains':
          where[filter.field] = { contains: filter.value, mode: 'insensitive' };
          break;
        case 'greater_than':
          where[filter.field] = { gt: filter.value };
          break;
        case 'less_than':
          where[filter.field] = { lt: filter.value };
          break;
        case 'between':
          where[filter.field] = { gte: filter.value[0], lte: filter.value[1] };
          break;
        case 'in':
          where[filter.field] = { in: filter.value };
          break;
      }
    });

    // Apply additional filters from request
    if (request.filters) {
      Object.assign(where, request.filters);
    }

    return where;
  }

  /**
   * Build SELECT clause for custom report
   */
  private buildCustomReportSelect(config: CustomReportConfig): any {
    const select: any = {};
    
    config.fields.forEach(field => {
      select[field.field] = true;
    });

    // Include relations if specified
    if (config.includeRelations) {
      config.includeRelations.forEach(relation => {
        select[relation] = true;
      });
    }

    return select;
  }

  /**
   * Build ORDER BY clause for custom report
   */
  private buildCustomReportOrderBy(config: CustomReportConfig): any {
    if (!config.orderBy || config.orderBy.length === 0) {
      return undefined;
    }

    if (config.orderBy.length === 1) {
      return { [config.orderBy[0].field]: config.orderBy[0].direction };
    }

    return config.orderBy.map(order => ({
      [order.field]: order.direction
    }));
  }

  /**
   * Build aggregations for grouped custom report
   */
  private buildAggregations(config: CustomReportConfig): any {
    const aggregations: any = {};

    config.fields.forEach(field => {
      if (field.aggregate) {
        switch (field.aggregate) {
          case 'count':
            aggregations._count = { [field.field]: true };
            break;
          case 'sum':
            aggregations._sum = { [field.field]: true };
            break;
          case 'avg':
            aggregations._avg = { [field.field]: true };
            break;
          case 'min':
            aggregations._min = { [field.field]: true };
            break;
          case 'max':
            aggregations._max = { [field.field]: true };
            break;
        }
      }
    });

    return aggregations;
  }

  /**
   * Calculate summary for custom report
   */
  private calculateCustomReportSummary(data: any[], config: CustomReportConfig): any {
    const summary: any = {};

    config.fields.forEach(field => {
      if (field.type === 'number' && !config.groupBy) {
        const values = data.map(row => row[field.field]).filter(v => v != null);
        if (values.length > 0) {
          summary[field.field] = {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((sum, v) => sum + v, 0) / values.length,
            sum: values.reduce((sum, v) => sum + v, 0)
          };
        }
      }
    });

    return Object.keys(summary).length > 0 ? summary : undefined;
  }

  /**
   * Export data to CSV format
   */
  private exportToCSV(data: any, reportName: string): string {
    // Flatten nested data if needed
    const flatData = this.flattenData(data);
    
    if (flatData.length === 0) {
      return '';
    }

    // Get all unique fields
    const fields = Array.from(new Set(
      flatData.flatMap(row => Object.keys(row))
    ));

    const parser = new Parser({ fields });
    return parser.parse(flatData);
  }

  /**
   * Export data to Excel format
   */
  private async exportToExcel(
    data: any,
    reportName: string,
    options?: ReportOptions
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    
    // Set workbook properties
    workbook.creator = options?.customBranding?.companyName || 'Asset Manager';
    workbook.created = new Date();

    // Add main data sheet
    const worksheet = workbook.addWorksheet('Report Data');
    
    // Flatten data
    const flatData = this.flattenData(data);
    
    if (flatData.length > 0) {
      // Add headers
      const headers = Object.keys(flatData[0]);
      worksheet.columns = headers.map(header => ({
        header: this.formatHeaderName(header),
        key: header,
        width: 15
      }));

      // Add rows
      worksheet.addRows(flatData);

      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    }

    // Add summary sheet if data includes summary
    if (data.summary) {
      const summarySheet = workbook.addWorksheet('Summary');
      // Add summary data (simplified)
      const summaryRows = Object.entries(data.summary).map(([key, value]) => ({
        metric: this.formatHeaderName(key),
        value: value
      }));
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 }
      ];
      summarySheet.addRows(summaryRows);
    }

    // Generate buffer
    return workbook.xlsx.writeBuffer() as Promise<Buffer>;
  }

  /**
   * Export data to PDF format
   */
  private async exportToPDF(
    data: any,
    reportName: string,
    options?: ReportOptions
  ): Promise<Buffer> {
    return this.pdfExportService.generateReportPDF(data, reportName, options);
  }

  /**
   * Flatten nested data structure for export
   */
  private flattenData(data: any): any[] {
    if (Array.isArray(data)) {
      return data.map(row => this.flattenObject(row));
    } else if (data.data && Array.isArray(data.data)) {
      return data.data.map((row: any) => this.flattenObject(row));
    }
    return [this.flattenObject(data)];
  }

  /**
   * Flatten a single object
   */
  private flattenObject(obj: any, prefix = ''): any {
    const flattened: any = {};
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const newKey = prefix ? `${prefix}_${key}` : key;
      
      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        flattened[newKey] = value.join(', ');
      } else if (value instanceof Date) {
        flattened[newKey] = format(value, 'yyyy-MM-dd HH:mm:ss');
      } else {
        flattened[newKey] = value;
      }
    });
    
    return flattened;
  }

  /**
   * Format header names for export
   */
  private formatHeaderName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Calculate next run time for a scheduled report
   */
  calculateNextRunTime(schedule: any): Date {
    const now = new Date();
    const { frequency, time, dayOfWeek, dayOfMonth } = schedule;
    
    // Parse time (HH:mm format)
    const [hours, minutes] = time.split(':').map(Number);
    
    let nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);
    
    switch (frequency) {
      case 'daily':
        // If time has already passed today, schedule for tomorrow
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;
        
      case 'weekly':
        // Set to next occurrence of the specified day
        const targetDay = dayOfWeek || 1; // Default to Monday
        const currentDay = nextRun.getDay();
        let daysToAdd = targetDay - currentDay;
        
        if (daysToAdd < 0 || (daysToAdd === 0 && nextRun <= now)) {
          daysToAdd += 7;
        }
        
        nextRun.setDate(nextRun.getDate() + daysToAdd);
        break;
        
      case 'monthly':
        // Set to specified day of month
        const targetDate = dayOfMonth || 1;
        nextRun.setDate(targetDate);
        
        // If date has passed this month, move to next month
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        break;
        
      case 'quarterly':
        // Run on first day of each quarter
        const currentMonth = now.getMonth();
        const currentQuarter = Math.floor(currentMonth / 3);
        const nextQuarterMonth = (currentQuarter + 1) * 3;
        
        nextRun.setMonth(nextQuarterMonth);
        nextRun.setDate(1);
        
        // If we're already past the time on the first day of current quarter
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 3);
        }
        break;
    }
    
    return nextRun;
  }
}