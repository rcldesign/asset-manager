import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import type { LegacyDataExport, MigrationContext, MigrationOptions, FileMapping } from './types';

/**
 * Validation schema for legacy data export
 */
const legacyAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serial: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().optional(),
  description: z.string().optional(),
  link: z.string().url().optional().or(z.literal('')),
  tags: z.array(z.string()).optional().default([]),
  warranty: z
    .object({
      scope: z.string().optional(),
      expiry: z.string().optional(),
      lifetime: z.boolean().optional().default(false),
      secondaryScope: z.string().optional(),
      secondaryExpiry: z.string().optional(),
    })
    .optional(),
  photos: z.array(z.string()).optional().default([]),
  receipt: z.string().optional(),
  manual: z.string().optional(),
  components: z.array(z.any()).optional().default([]), // Recursive validation would be complex
  maintenanceEvents: z.array(z.any()).optional().default([]),
  notes: z.string().optional(),
  location: z.string().optional(),
  condition: z.string().optional(),
  value: z.number().optional(),
  customFields: z.record(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const legacyDataExportSchema = z.object({
  version: z.string(),
  exportDate: z.string(),
  metadata: z
    .object({
      appVersion: z.string().optional(),
      totalAssets: z.number().optional(),
      totalComponents: z.number().optional(),
      totalMaintenanceEvents: z.number().optional(),
      totalUsers: z.number().optional(),
    })
    .optional(),
  organizations: z.array(z.any()).optional().default([]),
  users: z.array(z.any()).optional().default([]),
  assets: z.array(legacyAssetSchema),
  globalSettings: z.record(z.unknown()).optional(),
});

/**
 * Load and validate legacy data export from JSON file
 */
export async function loadLegacyData(filePath: string): Promise<LegacyDataExport> {
  try {
    logger.info('Loading legacy data from file', { filePath });

    // Check if file exists
    await fs.access(filePath);

    // Read and parse JSON
    const rawData = await fs.readFile(filePath, 'utf-8');
    const jsonData: unknown = JSON.parse(rawData);

    // Validate structure
    const validatedData = legacyDataExportSchema.parse(jsonData);

    logger.info('Legacy data loaded successfully', {
      version: validatedData.version,
      assetsCount: validatedData.assets.length,
      usersCount: validatedData.users?.length || 0,
      organizationsCount: validatedData.organizations?.length || 0,
    });

    return validatedData;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Legacy data validation failed', error, {
        errors: error.errors,
        filePath,
      });
      throw new Error(
        `Invalid legacy data format: ${error.errors.map((e) => e.message).join(', ')}`,
      );
    }

    if (error instanceof SyntaxError) {
      logger.error('Invalid JSON format', error, { filePath });
      throw new Error(`Invalid JSON format in file: ${error.message}`);
    }

    logger.error('Failed to load legacy data', error instanceof Error ? error : undefined, {
      filePath,
    });
    throw new Error(
      `Failed to load legacy data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Create migration context with default values
 */
export function createMigrationContext(
  organizationId: string,
  ownerUserId: string,
  options: MigrationOptions = {},
): MigrationContext {
  return {
    organizationId,
    ownerUserId,
    dryRun: options.dryRun || false,
    preserveIds: options.preserveIds || false,
    baseUploadPath: options.baseUploadPath,
    stats: {
      assetsProcessed: 0,
      componentsProcessed: 0,
      tasksCreated: 0,
      filesProcessed: 0,
      errors: 0,
      warnings: 0,
    },
    errors: [],
    warnings: [],
  };
}

/**
 * Add error to migration context
 */
export function addMigrationError(
  context: MigrationContext,
  type: 'asset' | 'component' | 'task' | 'file' | 'validation',
  message: string,
  id?: string,
  details?: unknown,
): void {
  context.errors.push({ type, id, message, details });
  context.stats.errors++;
  logger.error('Migration error', undefined, { type, id, message, details });
}

/**
 * Add warning to migration context
 */
export function addMigrationWarning(
  context: MigrationContext,
  type: 'asset' | 'component' | 'task' | 'file' | 'data',
  message: string,
  id?: string,
  details?: unknown,
): void {
  context.warnings.push({ type, id, message, details });
  context.stats.warnings++;
  logger.warn('Migration warning', { type, id, message, details });
}

/**
 * Parse date string to Date object with validation
 */
export function parseLegacyDate(dateString?: string): Date | null {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
}

/**
 * Sanitize and validate asset name
 */
export function sanitizeAssetName(name?: string): string {
  if (!name) return 'Untitled Asset';
  return name.trim().substring(0, 255) || 'Untitled Asset';
}

/**
 * Sanitize and validate tags array
 */
export function sanitizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim().substring(0, 50))
    .slice(0, 20); // Limit to 20 tags max
}

/**
 * Generate new UUID if preserveIds is false, otherwise use original
 */
export function generateOrPreserveId(originalId: string, preserveIds: boolean): string {
  if (preserveIds) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(originalId)) {
      return originalId;
    }
  }
  // Generate new UUID (this would typically use crypto.randomUUID() or similar)
  return crypto.randomUUID();
}

/**
 * Validate and normalize file path
 */
export function normalizeFilePath(filePath?: string, baseUploadPath?: string): string | null {
  if (!filePath) return null;

  try {
    // Remove any dangerous path components
    const normalized = path.normalize(filePath);

    // Prevent path traversal attacks
    if (normalized.includes('..')) {
      return null;
    }

    // If baseUploadPath is provided, make it relative to that
    if (baseUploadPath) {
      return path.join(baseUploadPath, path.basename(normalized));
    }

    return normalized;
  } catch {
    return null;
  }
}

/**
 * Check if file exists and is accessible
 */
export async function validateFilePath(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Create file mapping for asset attachments
 */
export function createFileMapping(
  originalPath: string,
  type: 'photo' | 'receipt' | 'manual' | 'attachment',
  baseUploadPath?: string,
  assetId?: string,
  componentId?: string,
  taskId?: string,
): FileMapping {
  const normalizedPath = normalizeFilePath(originalPath, baseUploadPath);

  return {
    originalPath,
    newPath: normalizedPath || originalPath,
    type,
    assetId,
    componentId,
    taskId,
    processed: false,
  };
}

/**
 * Map legacy maintenance event status to new task status
 */
export function mapMaintenanceEventStatus(
  status?: string,
): 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED' {
  switch (status?.toLowerCase()) {
    case 'completed':
      return 'DONE';
    case 'skipped':
      return 'SKIPPED';
    case 'in_progress':
    case 'inprogress':
    case 'active':
      return 'IN_PROGRESS';
    case 'pending':
    case 'planned':
    case 'scheduled':
    default:
      return 'PLANNED';
  }
}

/**
 * Map legacy priority to new task priority
 */
export function mapMaintenanceEventPriority(priority?: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  switch (priority?.toLowerCase()) {
    case 'high':
    case 'urgent':
    case 'critical':
      return 'HIGH';
    case 'low':
    case 'minor':
      return 'LOW';
    case 'medium':
    case 'normal':
    default:
      return 'MEDIUM';
  }
}

/**
 * Generate migration summary report
 */
export function generateMigrationReport(context: MigrationContext): string {
  const { stats, errors, warnings } = context;

  let report = '# Migration Report\n\n';
  report += `**Migration completed:** ${new Date().toISOString()}\n`;
  report += `**Dry run:** ${context.dryRun ? 'Yes' : 'No'}\n`;
  report += `**Preserve IDs:** ${context.preserveIds ? 'Yes' : 'No'}\n\n`;

  report += '## Statistics\n\n';
  report += `- Assets processed: ${stats.assetsProcessed}\n`;
  report += `- Components processed: ${stats.componentsProcessed}\n`;
  report += `- Tasks created: ${stats.tasksCreated}\n`;
  report += `- Files processed: ${stats.filesProcessed}\n`;
  report += `- Errors: ${stats.errors}\n`;
  report += `- Warnings: ${stats.warnings}\n\n`;

  if (errors.length > 0) {
    report += '## Errors\n\n';
    errors.forEach((error, index) => {
      report += `${index + 1}. **${error.type.toUpperCase()}** `;
      if (error.id) report += `(ID: ${error.id}) `;
      report += `${error.message}\n`;
      if (error.details) {
        report += `   Details: ${JSON.stringify(error.details, null, 2)}\n`;
      }
      report += '\n';
    });
  }

  if (warnings.length > 0) {
    report += '## Warnings\n\n';
    warnings.forEach((warning, index) => {
      report += `${index + 1}. **${warning.type.toUpperCase()}** `;
      if (warning.id) report += `(ID: ${warning.id}) `;
      report += `${warning.message}\n`;
      if (warning.details) {
        report += `   Details: ${JSON.stringify(warning.details, null, 2)}\n`;
      }
      report += '\n';
    });
  }

  return report;
}

/**
 * Log migration progress
 */
export function logMigrationProgress(context: MigrationContext, message: string): void {
  logger.info('Migration progress', {
    message,
    stats: context.stats,
    dryRun: context.dryRun,
  });
}
