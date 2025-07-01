import { AssetCategory, AssetStatus, TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, ValidationError } from '../utils/errors';
import { IRequestContext } from '../interfaces/context.interface';
import { AuditService } from './audit.service';
import { ActionType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as csv from 'csv-parse';
import * as XLSX from 'xlsx';

export interface ImportOptions {
  format: 'csv' | 'excel' | 'json';
  mapping?: FieldMapping;
  validateOnly?: boolean;
  skipErrors?: boolean;
  batchSize?: number;
}

export interface FieldMapping {
  [sourceField: string]: string | FieldMappingConfig;
}

export interface FieldMappingConfig {
  targetField: string;
  transform?: (value: any) => any;
  required?: boolean;
  defaultValue?: any;
}

export interface ImportResult {
  totalRecords: number;
  successCount: number;
  errorCount: number;
  errors: ImportError[];
  importedIds: string[];
  validationOnly: boolean;
}

export interface ImportError {
  row: number;
  field?: string;
  value?: any;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ImportError[];
}

/**
 * Service for handling data imports with field mapping capabilities.
 * Supports CSV, Excel, and JSON formats with validation and batch processing.
 */
export class DataImportService {
  private auditService: AuditService;
  private defaultBatchSize = 100;

  constructor() {
    this.auditService = new AuditService();
  }

  /**
   * Import assets from file
   */
  async importAssets(
    context: IRequestContext,
    filePath: string,
    options: ImportOptions
  ): Promise<ImportResult> {
    const data = await this.parseFile(filePath, options.format);
    
    if (options.validateOnly) {
      const validation = await this.validateAssets(data, options.mapping);
      return {
        totalRecords: data.length,
        successCount: validation.isValid ? data.length : 0,
        errorCount: validation.errors.length,
        errors: validation.errors,
        importedIds: [],
        validationOnly: true,
      };
    }

    const result: ImportResult = {
      totalRecords: data.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
      importedIds: [],
      validationOnly: false,
    };

    const batchSize = options.batchSize || this.defaultBatchSize;
    
    // Process in batches
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      await this.processBatch(
        batch,
        async (record, rowIndex) => {
          try {
            const mappedData = this.applyFieldMapping(record, options.mapping);
            const asset = await this.createAsset(context, mappedData, rowIndex + i + 1);
            result.importedIds.push(asset.id);
            result.successCount++;
          } catch (error: any) {
            result.errorCount++;
            result.errors.push({
              row: rowIndex + i + 1,
              message: error.message,
            });
            
            if (!options.skipErrors) {
              throw error;
            }
          }
        }
      );
    }

    // Log import action
    await this.auditService.log(prisma, {
      context,
      model: 'Asset',
      recordId: 'IMPORT',
      action: ActionType.CREATE,
      newValue: {
        format: options.format,
        totalRecords: result.totalRecords,
        successCount: result.successCount,
        errorCount: result.errorCount,
      },
    });

    return result;
  }

  /**
   * Import tasks from file
   */
  async importTasks(
    context: IRequestContext,
    filePath: string,
    options: ImportOptions
  ): Promise<ImportResult> {
    const data = await this.parseFile(filePath, options.format);
    
    if (options.validateOnly) {
      const validation = await this.validateTasks(data, options.mapping);
      return {
        totalRecords: data.length,
        successCount: validation.isValid ? data.length : 0,
        errorCount: validation.errors.length,
        errors: validation.errors,
        importedIds: [],
        validationOnly: true,
      };
    }

    const result: ImportResult = {
      totalRecords: data.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
      importedIds: [],
      validationOnly: false,
    };

    const batchSize = options.batchSize || this.defaultBatchSize;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      await this.processBatch(
        batch,
        async (record, rowIndex) => {
          try {
            const mappedData = this.applyFieldMapping(record, options.mapping);
            const task = await this.createTask(context, mappedData, rowIndex + i + 1);
            result.importedIds.push(task.id);
            result.successCount++;
          } catch (error: any) {
            result.errorCount++;
            result.errors.push({
              row: rowIndex + i + 1,
              message: error.message,
            });
            
            if (!options.skipErrors) {
              throw error;
            }
          }
        }
      );
    }

    await this.auditService.log(prisma, {
      context,
      model: 'Task',
      recordId: 'IMPORT',
      action: ActionType.CREATE,
      newValue: {
        format: options.format,
        totalRecords: result.totalRecords,
        successCount: result.successCount,
        errorCount: result.errorCount,
      },
    });

    return result;
  }

  /**
   * Import locations from file
   */
  async importLocations(
    context: IRequestContext,
    filePath: string,
    options: ImportOptions
  ): Promise<ImportResult> {
    const data = await this.parseFile(filePath, options.format);
    
    if (options.validateOnly) {
      const validation = await this.validateLocations(data, options.mapping);
      return {
        totalRecords: data.length,
        successCount: validation.isValid ? data.length : 0,
        errorCount: validation.errors.length,
        errors: validation.errors,
        importedIds: [],
        validationOnly: true,
      };
    }

    const result: ImportResult = {
      totalRecords: data.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
      importedIds: [],
      validationOnly: false,
    };

    // Sort locations by parent hierarchy to ensure parents are created first
    const sortedData = this.sortLocationsByHierarchy(data);
    const locationMap = new Map<string, string>(); // Map old IDs to new IDs

    for (let i = 0; i < sortedData.length; i++) {
      try {
        const record = sortedData[i];
        const mappedData = this.applyFieldMapping(record, options.mapping);
        
        // Update parent ID if it was mapped
        if (mappedData.parentId && locationMap.has(mappedData.parentId)) {
          mappedData.parentId = locationMap.get(mappedData.parentId);
        }

        const location = await this.createLocation(context, mappedData, i + 1);
        
        // Store mapping if original ID exists
        if (record.id) {
          locationMap.set(record.id, location.id);
        }

        result.importedIds.push(location.id);
        result.successCount++;
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({
          row: i + 1,
          message: error.message,
        });
        
        if (!options.skipErrors) {
          throw error;
        }
      }
    }

    return result;
  }

  /**
   * Parse file based on format
   */
  private async parseFile(filePath: string, format: string): Promise<any[]> {
    const fileContent = await fs.readFile(filePath);

    switch (format) {
      case 'json':
        return JSON.parse(fileContent.toString());

      case 'csv':
        return new Promise((resolve, reject) => {
          const records: any[] = [];
          const parser = csv.parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
          });

          parser.on('readable', function() {
            let record;
            while ((record = parser.read()) !== null) {
              records.push(record);
            }
          });

          parser.on('error', reject);
          parser.on('end', () => resolve(records));

          parser.write(fileContent);
          parser.end();
        });

      case 'excel':
        const workbook = XLSX.read(fileContent, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new AppError('Excel file contains no sheets', 400);
        }
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new AppError('Excel worksheet not found', 400);
        }
        return XLSX.utils.sheet_to_json(worksheet);

      default:
        throw new AppError(`Unsupported import format: ${format}`, 400);
    }
  }

  /**
   * Apply field mapping to a record
   */
  private applyFieldMapping(record: any, mapping?: FieldMapping): any {
    if (!mapping) {
      return record;
    }

    const mappedRecord: any = {};

    for (const [sourceField, config] of Object.entries(mapping)) {
      if (typeof config === 'string') {
        // Simple field mapping
        mappedRecord[config] = record[sourceField];
      } else {
        // Complex mapping with transformation
        let value = record[sourceField];

        if (value === undefined && config.defaultValue !== undefined) {
          value = config.defaultValue;
        }

        if (config.transform && value !== undefined) {
          value = config.transform(value);
        }

        if (config.required && (value === undefined || value === null || value === '')) {
          throw new ValidationError(`Required field '${sourceField}' is missing or empty`);
        }

        if (value !== undefined) {
          mappedRecord[config.targetField] = value;
        }
      }
    }

    // Include unmapped fields
    for (const [key, value] of Object.entries(record)) {
      if (!mapping[key] && !(key in mappedRecord)) {
        mappedRecord[key] = value;
      }
    }

    return mappedRecord;
  }

  /**
   * Validate assets data
   */
  private async validateAssets(data: any[], mapping?: FieldMapping): Promise<ValidationResult> {
    const errors: ImportError[] = [];

    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const rowNumber = i + 1;

      try {
        const mappedData = this.applyFieldMapping(record, mapping);

        // Required fields
        if (!mappedData.name) {
          errors.push({
            row: rowNumber,
            field: 'name',
            message: 'Asset name is required',
          });
        }

        if (!mappedData.category) {
          errors.push({
            row: rowNumber,
            field: 'category',
            message: 'Asset category is required',
          });
        } else if (!Object.values(AssetCategory).includes(mappedData.category)) {
          errors.push({
            row: rowNumber,
            field: 'category',
            value: mappedData.category,
            message: `Invalid category. Must be one of: ${Object.values(AssetCategory).join(', ')}`,
          });
        }

        // Optional field validations
        if (mappedData.status && !Object.values(AssetStatus).includes(mappedData.status)) {
          errors.push({
            row: rowNumber,
            field: 'status',
            value: mappedData.status,
            message: `Invalid status. Must be one of: ${Object.values(AssetStatus).join(', ')}`,
          });
        }

        if (mappedData.purchasePrice && isNaN(Number(mappedData.purchasePrice))) {
          errors.push({
            row: rowNumber,
            field: 'purchasePrice',
            value: mappedData.purchasePrice,
            message: 'Purchase price must be a valid number',
          });
        }

        // Date validations
        if (mappedData.purchaseDate && isNaN(Date.parse(mappedData.purchaseDate))) {
          errors.push({
            row: rowNumber,
            field: 'purchaseDate',
            value: mappedData.purchaseDate,
            message: 'Invalid purchase date format',
          });
        }

        if (mappedData.warrantyExpiry && isNaN(Date.parse(mappedData.warrantyExpiry))) {
          errors.push({
            row: rowNumber,
            field: 'warrantyExpiry',
            value: mappedData.warrantyExpiry,
            message: 'Invalid warranty expiry date format',
          });
        }
      } catch (error: any) {
        errors.push({
          row: rowNumber,
          message: error.message,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate tasks data
   */
  private async validateTasks(data: any[], mapping?: FieldMapping): Promise<ValidationResult> {
    const errors: ImportError[] = [];

    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const rowNumber = i + 1;

      try {
        const mappedData = this.applyFieldMapping(record, mapping);

        // Required fields
        if (!mappedData.title) {
          errors.push({
            row: rowNumber,
            field: 'title',
            message: 'Task title is required',
          });
        }

        if (!mappedData.dueDate) {
          errors.push({
            row: rowNumber,
            field: 'dueDate',
            message: 'Task due date is required',
          });
        } else if (isNaN(Date.parse(mappedData.dueDate))) {
          errors.push({
            row: rowNumber,
            field: 'dueDate',
            value: mappedData.dueDate,
            message: 'Invalid due date format',
          });
        }

        // Optional field validations
        if (mappedData.status && !Object.values(TaskStatus).includes(mappedData.status)) {
          errors.push({
            row: rowNumber,
            field: 'status',
            value: mappedData.status,
            message: `Invalid status. Must be one of: ${Object.values(TaskStatus).join(', ')}`,
          });
        }

        if (mappedData.priority && !Object.values(TaskPriority).includes(mappedData.priority)) {
          errors.push({
            row: rowNumber,
            field: 'priority',
            value: mappedData.priority,
            message: `Invalid priority. Must be one of: ${Object.values(TaskPriority).join(', ')}`,
          });
        }

        if (mappedData.estimatedCost && isNaN(Number(mappedData.estimatedCost))) {
          errors.push({
            row: rowNumber,
            field: 'estimatedCost',
            value: mappedData.estimatedCost,
            message: 'Estimated cost must be a valid number',
          });
        }
      } catch (error: any) {
        errors.push({
          row: rowNumber,
          message: error.message,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate locations data
   */
  private async validateLocations(data: any[], mapping?: FieldMapping): Promise<ValidationResult> {
    const errors: ImportError[] = [];

    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const rowNumber = i + 1;

      try {
        const mappedData = this.applyFieldMapping(record, mapping);

        // Required fields
        if (!mappedData.name) {
          errors.push({
            row: rowNumber,
            field: 'name',
            message: 'Location name is required',
          });
        }
      } catch (error: any) {
        errors.push({
          row: rowNumber,
          message: error.message,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Process a batch of records
   */
  private async processBatch<T>(
    batch: T[],
    processor: (record: T, index: number) => Promise<void>
  ): Promise<void> {
    await Promise.all(batch.map((record, index) => processor(record, index)));
  }

  /**
   * Create asset from imported data
   */
  private async createAsset(context: IRequestContext, data: any, rowNumber: number): Promise<any> {
    try {
      // Convert date strings to Date objects
      if (data.purchaseDate) {
        data.purchaseDate = new Date(data.purchaseDate);
      }
      if (data.warrantyExpiry) {
        data.warrantyExpiry = new Date(data.warrantyExpiry);
      }
      if (data.secondaryWarrantyExpiry) {
        data.secondaryWarrantyExpiry = new Date(data.secondaryWarrantyExpiry);
      }

      // Convert price to number
      if (data.purchasePrice) {
        data.purchasePrice = Number(data.purchasePrice);
      }

      // Ensure tags is an array
      if (data.tags && typeof data.tags === 'string') {
        data.tags = data.tags.split(',').map((tag: string) => tag.trim());
      }

      const asset = await prisma.asset.create({
        data: {
          ...data,
          organizationId: context.organizationId,
          path: '/', // Default path, will be updated if parent is set
        },
      });

      return asset;
    } catch (error: any) {
      throw new AppError(`Failed to create asset at row ${rowNumber}: ${error.message}`, 400);
    }
  }

  /**
   * Create task from imported data
   */
  private async createTask(context: IRequestContext, data: any, rowNumber: number): Promise<any> {
    try {
      // Convert date strings to Date objects
      if (data.dueDate) {
        data.dueDate = new Date(data.dueDate);
      }
      if (data.completedAt) {
        data.completedAt = new Date(data.completedAt);
      }
      if (data.skippedAt) {
        data.skippedAt = new Date(data.skippedAt);
      }

      // Convert costs to numbers
      if (data.estimatedCost) {
        data.estimatedCost = Number(data.estimatedCost);
      }
      if (data.actualCost) {
        data.actualCost = Number(data.actualCost);
      }

      // Convert minutes to numbers
      if (data.estimatedMinutes) {
        data.estimatedMinutes = Number(data.estimatedMinutes);
      }
      if (data.actualMinutes) {
        data.actualMinutes = Number(data.actualMinutes);
      }

      const task = await prisma.task.create({
        data: {
          ...data,
          organizationId: context.organizationId,
          status: data.status || TaskStatus.PLANNED,
          priority: data.priority || TaskPriority.MEDIUM,
        },
      });

      return task;
    } catch (error: any) {
      throw new AppError(`Failed to create task at row ${rowNumber}: ${error.message}`, 400);
    }
  }

  /**
   * Create location from imported data
   */
  private async createLocation(context: IRequestContext, data: any, rowNumber: number): Promise<any> {
    try {
      // Calculate path based on parent
      let path = '/';
      if (data.parentId) {
        const parent = await prisma.location.findFirst({
          where: {
            id: data.parentId,
            organizationId: context.organizationId,
          },
        });

        if (!parent) {
          throw new Error(`Parent location not found: ${data.parentId}`);
        }

        path = `${parent.path}${parent.id}/`;
      }

      const location = await prisma.location.create({
        data: {
          ...data,
          organizationId: context.organizationId,
          path,
        },
      });

      return location;
    } catch (error: any) {
      throw new AppError(`Failed to create location at row ${rowNumber}: ${error.message}`, 400);
    }
  }

  /**
   * Sort locations by hierarchy to ensure parents are created first
   */
  private sortLocationsByHierarchy(locations: any[]): any[] {
    const sorted: any[] = [];
    const remaining = [...locations];
    const processed = new Set<string>();

    // First, add all root locations (no parent)
    for (let i = remaining.length - 1; i >= 0; i--) {
      const location = remaining[i];
      if (!location.parentId) {
        sorted.push(location);
        if (location.id) {
          processed.add(location.id);
        }
        remaining.splice(i, 1);
      }
    }

    // Then, iteratively add locations whose parents have been processed
    while (remaining.length > 0) {
      const initialLength = remaining.length;

      for (let i = remaining.length - 1; i >= 0; i--) {
        const location = remaining[i];
        if (!location.parentId || processed.has(location.parentId)) {
          sorted.push(location);
          if (location.id) {
            processed.add(location.id);
          }
          remaining.splice(i, 1);
        }
      }

      // If no progress was made, we have a circular dependency or missing parent
      if (remaining.length === initialLength) {
        // Add remaining locations anyway (they'll fail validation)
        sorted.push(...remaining);
        break;
      }
    }

    return sorted;
  }
}

export const dataImportService = new DataImportService();