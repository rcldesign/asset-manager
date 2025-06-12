import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import type { LegacyMaintenanceEvent, MigrationContext, FileMapping } from './types';
import {
  addMigrationError,
  addMigrationWarning,
  parseLegacyDate,
  generateOrPreserveId,
  normalizeFilePath,
  createFileMapping,
  mapMaintenanceEventStatus,
  mapMaintenanceEventPriority,
  logMigrationProgress,
} from './utils';

export class TaskMigrator {
  private context: MigrationContext;
  private fileMappings: FileMapping[] = [];

  constructor(context: MigrationContext) {
    this.context = context;
  }

  /**
   * Migrate maintenance events from a legacy asset to tasks
   */
  async migrateMaintenanceEvents(
    maintenanceEvents: LegacyMaintenanceEvent[],
    assetId?: string,
  ): Promise<void> {
    for (const event of maintenanceEvents) {
      await this.migrateMaintenanceEvent(event, assetId);
    }
  }

  /**
   * Migrate a single legacy maintenance event to a task
   */
  async migrateMaintenanceEvent(
    legacyEvent: LegacyMaintenanceEvent,
    assetId?: string,
  ): Promise<string | null> {
    try {
      logMigrationProgress(this.context, `Migrating maintenance event: ${legacyEvent.title}`);

      // Generate or preserve task ID
      const taskId = generateOrPreserveId(legacyEvent.id, this.context.preserveIds);

      // Validate required fields
      const title = legacyEvent.title?.trim();
      if (!title) {
        addMigrationError(this.context, 'task', 'Maintenance event has no title', legacyEvent.id);
        return null;
      }

      // Parse dates
      const dueDate = parseLegacyDate(legacyEvent.dueDate);
      const completedAt = parseLegacyDate(legacyEvent.completedDate);

      // If no due date, set it to now for planning purposes
      const finalDueDate = dueDate || new Date();

      // Map status and priority
      const status = mapMaintenanceEventStatus(legacyEvent.status);
      const priority = mapMaintenanceEventPriority(legacyEvent.priority);

      // Handle costs
      let estimatedCost: Decimal | null = null;
      let actualCost: Decimal | null = null;

      if (legacyEvent.cost !== undefined && legacyEvent.cost !== null) {
        if (typeof legacyEvent.cost === 'number' && legacyEvent.cost >= 0) {
          // If event is completed, treat cost as actual cost
          if (status === 'DONE' && completedAt) {
            actualCost = new Decimal(legacyEvent.cost);
          } else {
            estimatedCost = new Decimal(legacyEvent.cost);
          }
        } else {
          addMigrationWarning(
            this.context,
            'task',
            'Invalid cost value, setting to null',
            legacyEvent.id,
            { originalCost: legacyEvent.cost },
          );
        }
      }

      // Handle duration
      let estimatedMinutes: number | null = null;
      let actualMinutes: number | null = null;

      if (legacyEvent.estimatedDuration !== undefined && legacyEvent.estimatedDuration !== null) {
        if (
          typeof legacyEvent.estimatedDuration === 'number' &&
          legacyEvent.estimatedDuration >= 0
        ) {
          estimatedMinutes = Math.round(legacyEvent.estimatedDuration);
        }
      }

      if (legacyEvent.actualDuration !== undefined && legacyEvent.actualDuration !== null) {
        if (typeof legacyEvent.actualDuration === 'number' && legacyEvent.actualDuration >= 0) {
          actualMinutes = Math.round(legacyEvent.actualDuration);
        }
      }

      // Process file attachments
      if (legacyEvent.attachments && legacyEvent.attachments.length > 0) {
        legacyEvent.attachments.forEach((attachment) => {
          this.processTaskFile(attachment, taskId);
        });
      }

      // Prepare task data for insertion
      const taskData: Prisma.TaskCreateInput = {
        id: taskId,
        title,
        description: legacyEvent.description || null,
        dueDate: finalDueDate,
        status,
        priority,
        estimatedCost,
        actualCost,
        estimatedMinutes,
        actualMinutes,
        completedAt,
        organization: {
          connect: { id: this.context.organizationId },
        },
        ...(assetId && {
          asset: {
            connect: { id: assetId },
          },
        }),
      };

      // Insert task if not dry run
      if (!this.context.dryRun) {
        try {
          await prisma.task.create({
            data: taskData,
          });
          logger.debug('Task created successfully', { taskId, title, assetId });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
              addMigrationError(
                this.context,
                'task',
                'Task with this ID already exists',
                legacyEvent.id,
                { taskId, error: error.message },
              );
              return null;
            }
          }
          throw error;
        }
      }

      this.context.stats.tasksCreated++;

      // Handle warnings for unmigrated data
      if (legacyEvent.recurring && legacyEvent.recurring.enabled) {
        addMigrationWarning(
          this.context,
          'task',
          'Maintenance event has recurring schedule that cannot be automatically migrated',
          legacyEvent.id,
          { recurring: legacyEvent.recurring },
        );
      }

      if (legacyEvent.assignedTo) {
        addMigrationWarning(
          this.context,
          'task',
          'Maintenance event has assignment that cannot be migrated (user system changed)',
          legacyEvent.id,
          { assignedTo: legacyEvent.assignedTo },
        );
      }

      if (legacyEvent.customFields && Object.keys(legacyEvent.customFields).length > 0) {
        addMigrationWarning(
          this.context,
          'task',
          'Maintenance event has custom fields that cannot be migrated',
          legacyEvent.id,
          { customFields: legacyEvent.customFields },
        );
      }

      if (legacyEvent.notes) {
        addMigrationWarning(
          this.context,
          'task',
          'Maintenance event has notes that should be manually added to description',
          legacyEvent.id,
          { notes: legacyEvent.notes },
        );
      }

      return taskId;
    } catch (error) {
      addMigrationError(
        this.context,
        'task',
        `Failed to migrate maintenance event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        legacyEvent.id,
        error,
      );
      return null;
    }
  }

  /**
   * Create default maintenance tasks for assets without maintenance events
   */
  async createDefaultMaintenanceTasks(assetId: string, assetName: string): Promise<void> {
    const defaultTasks = [
      {
        title: `Inspect ${assetName}`,
        description: 'General inspection and condition assessment',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        priority: 'MEDIUM' as const,
      },
      {
        title: `Clean ${assetName}`,
        description: 'Regular cleaning and maintenance',
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        priority: 'LOW' as const,
      },
    ];

    for (const taskTemplate of defaultTasks) {
      try {
        const taskId = crypto.randomUUID();

        const taskData: Prisma.TaskCreateInput = {
          id: taskId,
          title: taskTemplate.title,
          description: taskTemplate.description,
          dueDate: taskTemplate.dueDate,
          status: 'PLANNED',
          priority: taskTemplate.priority,
          organization: {
            connect: { id: this.context.organizationId },
          },
          asset: {
            connect: { id: assetId },
          },
        };

        if (!this.context.dryRun) {
          await prisma.task.create({
            data: taskData,
          });
          logger.debug('Default task created', { taskId, title: taskTemplate.title, assetId });
        }

        this.context.stats.tasksCreated++;
      } catch (error) {
        addMigrationError(
          this.context,
          'task',
          `Failed to create default task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          assetId,
          { taskTemplate, error },
        );
      }
    }
  }

  /**
   * Process task file attachment and create file mapping
   */
  private processTaskFile(filePath: string, taskId: string): string | null {
    if (!filePath) return null;

    const normalizedPath = normalizeFilePath(filePath, this.context.baseUploadPath);
    if (!normalizedPath) {
      addMigrationWarning(this.context, 'file', `Invalid file path: ${filePath}`, taskId, {
        filePath,
        type: 'attachment',
      });
      return null;
    }

    // Create file mapping for later processing
    const fileMapping = createFileMapping(
      filePath,
      'attachment',
      this.context.baseUploadPath,
      undefined,
      undefined,
      taskId,
    );
    this.fileMappings.push(fileMapping);

    this.context.stats.filesProcessed++;
    return normalizedPath;
  }

  /**
   * Get all file mappings created during migration
   */
  getFileMappings(): FileMapping[] {
    return this.fileMappings;
  }

  /**
   * Clear file mappings (useful for batch processing)
   */
  clearFileMappings(): void {
    this.fileMappings = [];
  }
}
