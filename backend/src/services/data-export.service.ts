import { prisma } from '../lib/prisma';
import { AppError, NotFoundError } from '../utils/errors';
import { IRequestContext } from '../interfaces/context.interface';
import { AuditService } from './audit.service';
import { ActionType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Parser } from 'json2csv';
import * as XLSX from 'xlsx';

export interface ExportOptions {
  format: 'json' | 'csv' | 'excel';
  includeRelations?: boolean;
  fields?: string[];
  filters?: Record<string, any>;
}

export interface ExportResult {
  fileName: string;
  filePath: string;
  recordCount: number;
  format: string;
  createdAt: Date;
}

export interface UserDataExport {
  userData: any;
  assets: any[];
  tasks: any[];
  taskAssignments: any[];
  taskComments: any[];
  activities: any[];
  notifications: any[];
  sessions: any[];
  apiTokens: any[];
  calendarIntegrations: any[];
  exportedAt: Date;
}

/**
 * Service for handling data exports in various formats.
 * Supports JSON, CSV, and Excel formats with field mapping capabilities.
 */
export class DataExportService {
  private auditService: AuditService;
  private exportPath: string;

  constructor() {
    this.auditService = new AuditService();
    this.exportPath = process.env.EXPORT_PATH || path.join(process.cwd(), 'exports');
  }

  /**
   * Initialize export directory if it doesn't exist
   */
  private async initializeExportDirectory(): Promise<void> {
    try {
      await fs.access(this.exportPath);
    } catch {
      await fs.mkdir(this.exportPath, { recursive: true });
    }
  }

  /**
   * Export assets in the specified format
   */
  async exportAssets(
    context: IRequestContext,
    options: ExportOptions
  ): Promise<ExportResult> {
    await this.initializeExportDirectory();

    // Build query with filters
    const where: any = {
      organizationId: context.organizationId,
    };

    if (options.filters) {
      Object.assign(where, options.filters);
    }

    // Fetch assets with optional relations
    const assets = await prisma.asset.findMany({
      where,
      include: options.includeRelations ? {
        location: true,
        assetTemplate: true,
        components: true,
        attachments: true,
        tasks: {
          include: {
            assignments: true,
          },
        },
      } : undefined,
    });

    // Generate export based on format
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let fileName: string;
    let filePath: string;

    switch (options.format) {
      case 'json':
        fileName = `assets-export-${timestamp}.json`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToJSON(assets, filePath, options.fields);
        break;

      case 'csv':
        fileName = `assets-export-${timestamp}.csv`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToCSV(assets, filePath, options.fields);
        break;

      case 'excel':
        fileName = `assets-export-${timestamp}.xlsx`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToExcel(assets, filePath, options.fields);
        break;

      default:
        throw new AppError(`Unsupported export format: ${options.format}`, 400);
    }

    // Log the export action
    await this.auditService.log(prisma, {
      context,
      model: 'Asset',
      recordId: 'EXPORT',
      action: ActionType.CREATE,
      newValue: {
        format: options.format,
        recordCount: assets.length,
        filters: options.filters,
        includeRelations: options.includeRelations,
      },
    });

    return {
      fileName,
      filePath,
      recordCount: assets.length,
      format: options.format,
      createdAt: new Date(),
    };
  }

  /**
   * Export tasks in the specified format
   */
  async exportTasks(
    context: IRequestContext,
    options: ExportOptions
  ): Promise<ExportResult> {
    await this.initializeExportDirectory();

    const where: any = {
      organizationId: context.organizationId,
    };

    if (options.filters) {
      Object.assign(where, options.filters);
    }

    const tasks = await prisma.task.findMany({
      where,
      include: options.includeRelations ? {
        asset: true,
        schedule: true,
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
        },
        comments: true,
        attachments: true,
        subtasks: true,
      } : undefined,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let fileName: string;
    let filePath: string;

    switch (options.format) {
      case 'json':
        fileName = `tasks-export-${timestamp}.json`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToJSON(tasks, filePath, options.fields);
        break;

      case 'csv':
        fileName = `tasks-export-${timestamp}.csv`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToCSV(tasks, filePath, options.fields);
        break;

      case 'excel':
        fileName = `tasks-export-${timestamp}.xlsx`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToExcel(tasks, filePath, options.fields);
        break;

      default:
        throw new AppError(`Unsupported export format: ${options.format}`, 400);
    }

    await this.auditService.log(prisma, {
      context,
      model: 'Task',
      recordId: 'EXPORT',
      action: ActionType.CREATE,
      newValue: {
        format: options.format,
        recordCount: tasks.length,
        filters: options.filters,
        includeRelations: options.includeRelations,
      },
    });

    return {
      fileName,
      filePath,
      recordCount: tasks.length,
      format: options.format,
      createdAt: new Date(),
    };
  }

  /**
   * Export all data for a specific user (GDPR compliance)
   */
  async exportUserData(
    context: IRequestContext,
    userId: string
  ): Promise<ExportResult> {
    await this.initializeExportDirectory();

    // Verify user exists and belongs to the organization
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: context.organizationId,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Collect all user-related data
    const userData: UserDataExport = {
      userData: user,
      assets: await prisma.asset.findMany({
        where: {
          organizationId: context.organizationId,
          OR: [
            { components: { some: { id: userId } } }, // If user is linked to components
          ],
        },
      }),
      tasks: await prisma.task.findMany({
        where: {
          organizationId: context.organizationId,
          assignments: {
            some: {
              userId,
            },
          },
        },
      }),
      taskAssignments: await prisma.taskAssignment.findMany({
        where: { userId },
      }),
      taskComments: await prisma.taskComment.findMany({
        where: { userId },
      }),
      activities: await prisma.activityStream.findMany({
        where: { userId },
      }),
      notifications: await prisma.notification.findMany({
        where: { userId },
      }),
      sessions: await prisma.session.findMany({
        where: { userId },
      }),
      apiTokens: await prisma.apiToken.findMany({
        where: { userId },
      }),
      calendarIntegrations: await prisma.calendarIntegration.findMany({
        where: { userId },
      }),
      exportedAt: new Date(),
    };

    // Export as JSON (GDPR typically requires machine-readable format)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `user-data-export-${userId}-${timestamp}.json`;
    const filePath = path.join(this.exportPath, fileName);

    await fs.writeFile(filePath, JSON.stringify(userData, null, 2));

    // Log GDPR export
    await this.auditService.log(prisma, {
      context,
      model: 'User',
      recordId: userId,
      action: ActionType.CREATE,
      newValue: {
        type: 'GDPR_DATA_EXPORT',
        exportedAt: userData.exportedAt,
      },
    });

    return {
      fileName,
      filePath,
      recordCount: 1,
      format: 'json',
      createdAt: new Date(),
    };
  }

  /**
   * Export locations in the specified format
   */
  async exportLocations(
    context: IRequestContext,
    options: ExportOptions
  ): Promise<ExportResult> {
    await this.initializeExportDirectory();

    const where: any = {
      organizationId: context.organizationId,
    };

    if (options.filters) {
      Object.assign(where, options.filters);
    }

    const locations = await prisma.location.findMany({
      where,
      include: options.includeRelations ? {
        parent: true,
        children: true,
        assets: true,
      } : undefined,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let fileName: string;
    let filePath: string;

    switch (options.format) {
      case 'json':
        fileName = `locations-export-${timestamp}.json`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToJSON(locations, filePath, options.fields);
        break;

      case 'csv':
        fileName = `locations-export-${timestamp}.csv`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToCSV(locations, filePath, options.fields);
        break;

      case 'excel':
        fileName = `locations-export-${timestamp}.xlsx`;
        filePath = path.join(this.exportPath, fileName);
        await this.exportToExcel(locations, filePath, options.fields);
        break;

      default:
        throw new AppError(`Unsupported export format: ${options.format}`, 400);
    }

    return {
      fileName,
      filePath,
      recordCount: locations.length,
      format: options.format,
      createdAt: new Date(),
    };
  }

  /**
   * Export to JSON format
   */
  private async exportToJSON(data: any[], filePath: string, fields?: string[]): Promise<void> {
    let exportData = data;

    if (fields && fields.length > 0) {
      exportData = data.map(item => {
        const filtered: any = {};
        fields.forEach(field => {
          if (field.includes('.')) {
            // Handle nested fields
            const parts = field.split('.');
            let value = item;
            for (const part of parts) {
              value = value?.[part];
            }
            filtered[field] = value;
          } else {
            filtered[field] = item[field];
          }
        });
        return filtered;
      });
    }

    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
  }

  /**
   * Export to CSV format
   */
  private async exportToCSV(data: any[], filePath: string, fields?: string[]): Promise<void> {
    if (data.length === 0) {
      await fs.writeFile(filePath, '');
      return;
    }

    // Flatten nested objects for CSV
    const flattenedData = data.map(item => this.flattenObject(item));

    const csvFields = fields || Object.keys(flattenedData[0]);
    const parser = new Parser({ fields: csvFields });
    const csv = parser.parse(flattenedData);

    await fs.writeFile(filePath, csv);
  }

  /**
   * Export to Excel format
   */
  private async exportToExcel(data: any[], filePath: string, fields?: string[]): Promise<void> {
    const workbook = XLSX.utils.book_new();
    
    if (data.length === 0) {
      const worksheet = XLSX.utils.aoa_to_sheet([['No data to export']]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
    } else {
      // Flatten nested objects for Excel
      const flattenedData = data.map(item => this.flattenObject(item));
      
      // Filter fields if specified
      let exportData = flattenedData;
      if (fields && fields.length > 0) {
        exportData = flattenedData.map(item => {
          const filtered: any = {};
          fields.forEach(field => {
            filtered[field] = item[field];
          });
          return filtered;
        });
      }

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
    }

    XLSX.writeFile(workbook, filePath);
  }

  /**
   * Flatten nested objects for CSV/Excel export
   */
  private flattenObject(obj: any, prefix = ''): any {
    const flattened: any = {};

    for (const key in obj) {
      if (obj[key] === null || obj[key] === undefined) {
        flattened[prefix + key] = '';
      } else if (obj[key] instanceof Date) {
        flattened[prefix + key] = obj[key].toISOString();
      } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        Object.assign(flattened, this.flattenObject(obj[key], prefix + key + '.'));
      } else if (Array.isArray(obj[key])) {
        flattened[prefix + key] = obj[key].length > 0 ? JSON.stringify(obj[key]) : '';
      } else {
        flattened[prefix + key] = obj[key];
      }
    }

    return flattened;
  }

  /**
   * Clean up old export files
   */
  async cleanupOldExports(daysToKeep: number = 7): Promise<number> {
    await this.initializeExportDirectory();

    const files = await fs.readdir(this.exportPath);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(this.exportPath, file);
      const stats = await fs.stat(filePath);

      if (stats.mtime < cutoffDate) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}

export const dataExportService = new DataExportService();