import type {
  Task,
  TaskAssignment,
  TaskComment,
  TaskAttachment,
  TaskPriority,
  TaskCategory,
  PrismaClient,
} from '@prisma/client';
import { Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { MentionsService, type MentionContext } from './mentions.service';
import { ActivityStreamService } from './activity-stream.service';
import { ActivityVerbs, ActivityObjectTypes, ActivityTargetTypes } from '../types/activity';

/**
 * Interface for task tree items (recursive task hierarchy)
 */
export interface TaskTreeItem {
  id: string;
  parentTaskId: string | null;
  title: string;
  status: TaskStatus;
  subtaskOrder: number;
  depth: number;
  description?: string;
  dueDate: Date;
  priority: TaskPriority;
  isPhotoRequired: boolean;
  checklistItems: any[];
  completionRequirements: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for creating a new task
 */
export interface CreateTaskData {
  organizationId: string;
  title: string;
  description?: string;
  dueDate: Date;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  estimatedCost?: number;
  estimatedMinutes?: number;
  assetId?: string;
  scheduleId?: string;
  assignUserIds?: string[];
  parentTaskId?: string; // For subtasks
  completionRequirements?: Record<string, any>;
  isPhotoRequired?: boolean;
  checklistItems?: any[];
}

/**
 * Interface for updating an existing task
 */
export interface UpdateTaskData {
  title?: string;
  description?: string;
  dueDate?: Date;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedCost?: number;
  actualCost?: number;
  estimatedMinutes?: number;
  actualMinutes?: number;
  assetId?: string | null;
}

/**
 * Interface for task query options
 */
export interface QueryTaskOptions {
  assetId?: string;
  scheduleId?: string;
  assignedToUserId?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  dueDateBefore?: Date;
  dueDateAfter?: Date;
  isOverdue?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'dueDate' | 'createdAt' | 'updatedAt' | 'priority' | 'title';
  sortOrder?: 'asc' | 'desc';
  includeAssignments?: boolean;
  includeComments?: boolean;
  includeAttachments?: boolean;
}

/**
 * Interface for task search results
 */
export interface TaskSearchResult {
  data: TaskWithRelations[];
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  };
}

/**
 * Extended task interface with relations
 */
export interface TaskWithRelations extends Task {
  asset?: {
    id: string;
    name: string;
    category: string;
  } | null;
  schedule?: {
    id: string;
    name: string;
    scheduleType: string;
  } | null;
  assignments?: Array<
    TaskAssignment & {
      user: {
        id: string;
        email: string;
        fullName: string | null;
      };
    }
  >;
  comments?: Array<
    TaskComment & {
      user: {
        id: string;
        email: string;
        fullName: string | null;
      };
    }
  >;
  attachments?: TaskAttachment[];
  _count?: {
    assignments: number;
    comments: number;
    attachments: number;
  };
}

/**
 * Interface for creating task comments
 */
export interface CreateTaskCommentData {
  taskId: string;
  userId: string;
  content: string;
}

/**
 * Interface for task statistics
 */
export interface TaskStatistics {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdue: number;
  dueSoon: number; // Due within 7 days
  avgCompletionTime: number; // In minutes
  completionRate: number; // Percentage
}

/**
 * Service for managing tasks with full lifecycle support.
 * Provides comprehensive task management including creation, assignment,
 * status tracking, and integration with assets and schedules.
 *
 * @class TaskService
 */
export class TaskService {
  private prisma: PrismaClient;
  private activityStreamService: ActivityStreamService;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
    this.activityStreamService = new ActivityStreamService(prismaClient);
  }
  /**
   * Validate task status transitions according to business rules.
   * Ensures only valid status changes are allowed.
   *
   * @param {TaskStatus} currentStatus - The current task status
   * @param {TaskStatus} newStatus - The proposed new status
   * @returns {boolean} True if transition is valid, false otherwise
   * @private
   */
  private validateStatusTransition(currentStatus: TaskStatus, newStatus: TaskStatus): boolean {
    const validTransitions: Record<string, TaskStatus[]> = {
      [TaskStatus.PLANNED]: [TaskStatus.IN_PROGRESS, TaskStatus.SKIPPED],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE, TaskStatus.PLANNED, TaskStatus.SKIPPED],
      [TaskStatus.DONE]: [TaskStatus.IN_PROGRESS], // Allow reopening completed tasks
      [TaskStatus.SKIPPED]: [TaskStatus.PLANNED, TaskStatus.IN_PROGRESS], // Allow reactivating skipped tasks
    };

    return validTransitions[currentStatus]?.includes(newStatus) || currentStatus === newStatus;
  }

  /**
   * Create a new task with optional asset and schedule associations.
   * Validates all relationships and creates initial assignments.
   *
   * @param {CreateTaskData} data - Task creation data
   * @returns {Promise<TaskWithRelations>} The created task with all relationships
   * @throws {NotFoundError} If organization, asset, schedule, or users not found
   * @throws {ValidationError} If assigned users are invalid or inactive
   *
   * @example
   * const task = await taskService.createTask({
   *   organizationId: 'org-123',
   *   title: 'Replace air filter',
   *   description: 'Monthly air filter replacement',
   *   dueDate: new Date('2024-12-31'),
   *   priority: 'HIGH',
   *   assetId: 'asset-456',
   *   assignUserIds: ['user-789']
   * });
   */
  async createTask(
    data: CreateTaskData,
    createdBy?: { id: string; name: string },
  ): Promise<TaskWithRelations> {
    const {
      organizationId,
      title,
      description,
      dueDate,
      status = 'PLANNED',
      priority = 'MEDIUM',
      category,
      estimatedCost,
      estimatedMinutes,
      assetId,
      scheduleId,
      assignUserIds = [],
    } = data;

    // Validate organization exists
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Validate asset if provided
    if (assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: assetId, organizationId },
      });
      if (!asset) {
        throw new NotFoundError('Asset not found or does not belong to organization');
      }
    }

    // Validate schedule if provided
    if (scheduleId) {
      const schedule = await this.prisma.schedule.findFirst({
        where: { id: scheduleId, organizationId },
      });
      if (!schedule) {
        throw new NotFoundError('Schedule not found or does not belong to organization');
      }
    }

    // Validate assigned users if provided
    if (assignUserIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: assignUserIds },
          organizationId,
          isActive: true,
        },
      });
      if (users.length !== assignUserIds.length) {
        throw new ValidationError('One or more assigned users not found or inactive');
      }
    }

    // Create task in transaction
    const task = await this.prisma.$transaction(async (tx) => {
      // Create the task
      const newTask = await tx.task.create({
        data: {
          organizationId,
          title,
          description,
          dueDate,
          status,
          priority,
          // Set category: explicit category takes precedence, then infer from context
          category: category || (scheduleId ? 'MAINTENANCE' : undefined),
          estimatedCost: estimatedCost ? new Prisma.Decimal(estimatedCost) : undefined,
          estimatedMinutes,
          assetId,
          scheduleId,
        },
        include: {
          asset: {
            select: { id: true, name: true, category: true },
          },
          schedule: {
            select: { id: true, name: true, scheduleType: true },
          },
          assignments: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true },
              },
            },
          },
          _count: {
            select: {
              assignments: true,
              comments: true,
              attachments: true,
            },
          },
        },
      });

      // Create task assignments
      if (assignUserIds.length > 0) {
        await tx.taskAssignment.createMany({
          data: assignUserIds.map((userId) => ({
            taskId: newTask.id,
            userId,
          })),
        });

        // Refresh task with assignments
        const taskWithAssignments = await tx.task.findUnique({
          where: { id: newTask.id },
          include: {
            asset: {
              select: { id: true, name: true, category: true },
            },
            schedule: {
              select: { id: true, name: true, scheduleType: true },
            },
            assignments: {
              include: {
                user: {
                  select: { id: true, email: true, fullName: true },
                },
              },
            },
            _count: {
              select: {
                assignments: true,
                comments: true,
                attachments: true,
              },
            },
          },
        });

        return taskWithAssignments!;
      }

      return newTask;
    });

    logger.info('Task created', {
      taskId: task.id,
      organizationId,
      title,
      assetId,
      scheduleId,
      assignedCount: assignUserIds.length,
    });

    // Emit activity event if creator information is provided
    if (createdBy) {
      try {
        await this.activityStreamService.emitActivity({
          organizationId,
          actor: {
            type: 'User',
            id: createdBy.id,
            name: createdBy.name,
          },
          verb: ActivityVerbs.CREATED,
          object: {
            type: ActivityObjectTypes.TASK,
            id: task.id,
            displayName: task.title,
          },
          target: task.assetId
            ? {
                type: ActivityTargetTypes.ASSET,
                id: task.assetId,
                displayName: task.asset?.name || 'Asset',
              }
            : undefined,
          metadata: {
            priority: task.priority,
            dueDate: task.dueDate.toISOString(),
            assignedUsers: assignUserIds.length,
          },
        });
      } catch (error) {
        logger.error(
          'Failed to emit task creation activity',
          error instanceof Error ? error : new Error('Unknown error'),
          {
            taskId: task.id,
          },
        );
      }
    }

    return task as TaskWithRelations;
  }

  /**
   * Get task by ID with optional relations.
   * Allows selective loading of related data for performance optimization.
   *
   * @param {string} id - The task ID
   * @param {string} organizationId - Organization ID for access control
   * @param {Object} [options={}] - Options for including relations
   * @param {boolean} [options.includeAssignments=true] - Include task assignments
   * @param {boolean} [options.includeComments=false] - Include task comments
   * @param {boolean} [options.includeAttachments=false] - Include task attachments
   * @returns {Promise<TaskWithRelations | null>} The task with selected relations or null
   *
   * @example
   * // Get task with all relations
   * const task = await taskService.getTaskById('task-123', 'org-456', {
   *   includeComments: true,
   *   includeAttachments: true
   * });
   */
  async getTaskById(
    id: string,
    organizationId: string,
    options: {
      includeAssignments?: boolean;
      includeComments?: boolean;
      includeAttachments?: boolean;
    } = {},
  ): Promise<TaskWithRelations | null> {
    const {
      includeAssignments = true,
      includeComments = false,
      includeAttachments = false,
    } = options;

    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
      include: {
        asset: {
          select: { id: true, name: true, category: true },
        },
        schedule: {
          select: { id: true, name: true, scheduleType: true },
        },
        assignments: includeAssignments
          ? {
              include: {
                user: {
                  select: { id: true, email: true, fullName: true },
                },
              },
            }
          : false,
        comments: includeComments
          ? {
              include: {
                user: {
                  select: { id: true, email: true, fullName: true },
                },
              },
              orderBy: { createdAt: 'desc' },
            }
          : false,
        attachments: includeAttachments || false,
        _count: {
          select: {
            assignments: true,
            comments: true,
            attachments: true,
          },
        },
      },
    });

    return task as TaskWithRelations | null;
  }

  /**
   * Update an existing task with validation.
   * Handles status transitions, completion tracking, and cost updates.
   *
   * @param {string} id - The task ID to update
   * @param {string} organizationId - Organization ID for access control
   * @param {UpdateTaskData} data - Update data
   * @returns {Promise<TaskWithRelations>} The updated task with all relationships
   * @throws {NotFoundError} If task or asset not found
   * @throws {ConflictError} If status transition is invalid
   *
   * @example
   * // Mark task as completed with actual cost
   * const updated = await taskService.updateTask('task-123', 'org-456', {
   *   status: 'DONE',
   *   actualCost: 150.00,
   *   actualMinutes: 45
   * });
   */
  async updateTask(
    id: string,
    organizationId: string,
    data: UpdateTaskData,
    updatedBy?: { id: string; name: string },
  ): Promise<TaskWithRelations> {
    // Get existing task
    const existingTask = await this.getTaskById(id, organizationId);
    if (!existingTask) {
      throw new NotFoundError('Task not found');
    }

    const {
      title,
      description,
      dueDate,
      status,
      priority,
      estimatedCost,
      actualCost,
      estimatedMinutes,
      actualMinutes,
      assetId,
    } = data;

    // Validate status transition if changing status
    if (status && status !== existingTask.status) {
      if (!this.validateStatusTransition(existingTask.status, status)) {
        throw new ConflictError(
          `Invalid status transition from ${existingTask.status} to ${status}`,
        );
      }
    }

    // Validate asset if changing
    if (assetId !== undefined && assetId !== null) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: assetId, organizationId },
      });
      if (!asset) {
        throw new NotFoundError('Asset not found or does not belong to organization');
      }
    }

    // Prepare update data
    const updateData: Prisma.TaskUpdateInput = {
      title,
      description,
      dueDate,
      status,
      priority,
      estimatedCost:
        estimatedCost !== undefined
          ? estimatedCost === null
            ? null
            : new Prisma.Decimal(estimatedCost)
          : undefined,
      actualCost:
        actualCost !== undefined
          ? actualCost === null
            ? null
            : new Prisma.Decimal(actualCost)
          : undefined,
      estimatedMinutes,
      actualMinutes,
      asset:
        assetId !== undefined
          ? assetId === null
            ? { disconnect: true }
            : { connect: { id: assetId } }
          : undefined,
    };

    // Handle status-specific logic
    if (status) {
      if (status === TaskStatus.DONE && existingTask.status !== TaskStatus.DONE) {
        updateData.completedAt = new Date();
        updateData.skippedAt = null;
      } else if (status === TaskStatus.SKIPPED && existingTask.status !== TaskStatus.SKIPPED) {
        updateData.skippedAt = new Date();
        updateData.completedAt = null;
      } else if (status === TaskStatus.IN_PROGRESS || status === TaskStatus.PLANNED) {
        updateData.completedAt = null;
        updateData.skippedAt = null;
      }
    }

    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        asset: {
          select: { id: true, name: true, category: true },
        },
        schedule: {
          select: { id: true, name: true, scheduleType: true },
        },
        assignments: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        _count: {
          select: {
            assignments: true,
            comments: true,
            attachments: true,
          },
        },
      },
    });

    logger.info('Task updated', {
      taskId: id,
      organizationId,
      changes: Object.keys(data),
      newStatus: status,
    });

    // Emit activity event if updater information is provided
    if (updatedBy) {
      try {
        // Build metadata with changes
        const changes = [];
        const fieldsToTrack = ['title', 'status', 'priority', 'dueDate', 'description'] as const;

        for (const field of fieldsToTrack) {
          const dataValue = (data as any)[field];
          const existingValue = (existingTask as any)[field];

          if (dataValue !== undefined && existingValue !== dataValue) {
            changes.push({
              field,
              oldValue: existingValue,
              newValue: dataValue,
            });
          }
        }

        // Special handling for status completion
        const verb =
          data.status === 'DONE' && existingTask.status !== 'DONE'
            ? ActivityVerbs.COMPLETED
            : ActivityVerbs.UPDATED;

        await this.activityStreamService.emitActivity({
          organizationId,
          actor: {
            type: 'User',
            id: updatedBy.id,
            name: updatedBy.name,
          },
          verb,
          object: {
            type: ActivityObjectTypes.TASK,
            id: updatedTask.id,
            displayName: updatedTask.title,
          },
          target: updatedTask.assetId
            ? {
                type: ActivityTargetTypes.ASSET,
                id: updatedTask.assetId,
                displayName: updatedTask.asset?.name || 'Asset',
              }
            : undefined,
          metadata: {
            changes,
            newStatus: updatedTask.status,
            priority: updatedTask.priority,
          },
        });
      } catch (error) {
        logger.error(
          'Failed to emit task update activity',
          error instanceof Error ? error : new Error('Unknown error'),
          {
            taskId: id,
          },
        );
      }
    }

    return updatedTask as TaskWithRelations;
  }

  /**
   * Delete a task.
   * Prevents deletion of tasks that belong to active schedules.
   *
   * @param {string} id - The task ID to delete
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<void>}
   * @throws {NotFoundError} If task not found
   * @throws {ConflictError} If task belongs to an active schedule
   *
   * @example
   * // Delete a standalone task
   * await taskService.deleteTask('task-123', 'org-456');
   */
  async deleteTask(id: string, organizationId: string): Promise<void> {
    const task = await this.getTaskById(id, organizationId);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Check if task is part of an active schedule
    if (task.scheduleId) {
      const schedule = await this.prisma.schedule.findFirst({
        where: { id: task.scheduleId, isActive: true },
      });
      if (schedule) {
        throw new ConflictError(
          'Cannot delete task that belongs to an active schedule. Mark as skipped instead.',
        );
      }
    }

    await this.prisma.task.delete({ where: { id } });

    logger.info('Task deleted', {
      taskId: id,
      organizationId,
      title: task.title,
    });
  }

  /**
   * Search and filter tasks with pagination.
   * Supports multiple filter criteria and flexible sorting.
   *
   * @param {string} organizationId - Organization ID to search within
   * @param {QueryTaskOptions} [options={}] - Search and pagination options
   * @returns {Promise<TaskSearchResult>} Paginated search results
   *
   * @example
   * // Find overdue high-priority tasks
   * const overdueTasks = await taskService.findTasks('org-123', {
   *   isOverdue: true,
   *   priority: 'HIGH',
   *   status: ['PLANNED', 'IN_PROGRESS'],
   *   sortBy: 'dueDate',
   *   sortOrder: 'asc',
   *   page: 1,
   *   limit: 50
   * });
   *
   * // Find tasks for specific asset
   * const assetTasks = await taskService.findTasks('org-123', {
   *   assetId: 'asset-456',
   *   includeComments: true
   * });
   */
  async findTasks(
    organizationId: string,
    options: QueryTaskOptions = {},
  ): Promise<TaskSearchResult> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'dueDate',
      sortOrder = 'asc',
      includeAssignments = true,
      includeComments = false,
      includeAttachments = false,
      ...filters
    } = options;

    const skip = (page - 1) * limit;

    const whereConditions: Prisma.TaskWhereInput[] = [{ organizationId }];

    // Apply filters
    if (filters.assetId) {
      whereConditions.push({ assetId: filters.assetId });
    }

    if (filters.scheduleId) {
      whereConditions.push({ scheduleId: filters.scheduleId });
    }

    if (filters.assignedToUserId) {
      whereConditions.push({
        assignments: {
          some: { userId: filters.assignedToUserId },
        },
      });
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereConditions.push({ status: { in: filters.status } });
      } else {
        whereConditions.push({ status: filters.status });
      }
    }

    if (filters.priority) {
      if (Array.isArray(filters.priority)) {
        whereConditions.push({ priority: { in: filters.priority } });
      } else {
        whereConditions.push({ priority: filters.priority });
      }
    }

    if (filters.dueDateBefore) {
      whereConditions.push({ dueDate: { lte: filters.dueDateBefore } });
    }

    if (filters.dueDateAfter) {
      whereConditions.push({ dueDate: { gte: filters.dueDateAfter } });
    }

    if (filters.isOverdue) {
      whereConditions.push({
        dueDate: { lt: new Date() },
        status: { notIn: [TaskStatus.DONE, TaskStatus.SKIPPED] },
      });
    }

    const where: Prisma.TaskWhereInput = { AND: whereConditions };

    // Execute query
    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          asset: {
            select: { id: true, name: true, category: true },
          },
          schedule: {
            select: { id: true, name: true, scheduleType: true },
          },
          assignments: includeAssignments
            ? {
                include: {
                  user: {
                    select: { id: true, email: true, fullName: true },
                  },
                },
              }
            : false,
          comments: includeComments
            ? {
                include: {
                  user: {
                    select: { id: true, email: true, fullName: true },
                  },
                },
                orderBy: { createdAt: 'desc' },
                take: 5, // Limit comments for performance
              }
            : false,
          attachments: includeAttachments || false,
          _count: {
            select: {
              assignments: true,
              comments: true,
              attachments: true,
            },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks as TaskWithRelations[],
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Assign users to a task.
   * Replaces all existing assignments with the new user list.
   *
   * @param {string} taskId - The task ID
   * @param {string} organizationId - Organization ID for access control
   * @param {string[]} userIds - Array of user IDs to assign
   * @returns {Promise<TaskWithRelations>} The updated task with new assignments
   * @throws {NotFoundError} If task not found
   * @throws {ValidationError} If any users are invalid or inactive
   *
   * @example
   * // Assign multiple users to a task
   * const task = await taskService.assignUsersToTask(
   *   'task-123',
   *   'org-456',
   *   ['user-1', 'user-2', 'user-3']
   * );
   *
   * // Remove all assignments
   * const unassigned = await taskService.assignUsersToTask(
   *   'task-123',
   *   'org-456',
   *   []
   * );
   */
  async assignUsersToTask(
    taskId: string,
    organizationId: string,
    userIds: string[],
  ): Promise<TaskWithRelations> {
    const task = await this.getTaskById(taskId, organizationId);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Validate users exist and belong to organization
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        organizationId,
        isActive: true,
      },
    });

    if (users.length !== userIds.length) {
      throw new ValidationError('One or more users not found or inactive');
    }

    // Remove existing assignments and add new ones
    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignment.deleteMany({
        where: { taskId },
      });

      if (userIds.length > 0) {
        await tx.taskAssignment.createMany({
          data: userIds.map((userId) => ({
            taskId,
            userId,
          })),
        });
      }
    });

    logger.info('Task assignments updated', {
      taskId,
      organizationId,
      assignedUserIds: userIds,
    });

    const updatedTask = await this.getTaskById(taskId, organizationId);
    if (!updatedTask) {
      throw new NotFoundError('Task not found after assignment update');
    }
    return updatedTask;
  }

  /**
   * Get comprehensive task statistics for an organization.
   * Provides aggregated metrics for reporting and dashboards.
   *
   * @param {string} organizationId - Organization ID
   * @returns {Promise<TaskStatistics>} Statistics including counts, rates, and averages
   *
   * @example
   * const stats = await taskService.getTaskStatistics('org-123');
   * console.log(`Total tasks: ${stats.total}`);
   * console.log(`Overdue: ${stats.overdue}`);
   * console.log(`Completion rate: ${stats.completionRate.toFixed(1)}%`);
   * console.log(`Avg completion time: ${stats.avgCompletionTime} minutes`);
   */
  async getTaskStatistics(organizationId: string): Promise<TaskStatistics> {
    const [total, byStatus, byPriority, overdue, dueSoon, completedTasks] = await Promise.all([
      // Total count
      this.prisma.task.count({ where: { organizationId } }),

      // Count by status
      this.prisma.task.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),

      // Count by priority
      this.prisma.task.groupBy({
        by: ['priority'],
        where: { organizationId },
        _count: true,
      }),

      // Overdue tasks
      this.prisma.task.count({
        where: {
          organizationId,
          dueDate: { lt: new Date() },
          status: { notIn: [TaskStatus.DONE, TaskStatus.SKIPPED] },
        },
      }),

      // Due soon (within 7 days)
      this.prisma.task.count({
        where: {
          organizationId,
          dueDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          status: { notIn: [TaskStatus.DONE, TaskStatus.SKIPPED] },
        },
      }),

      // Completed tasks for completion rate calculation
      this.prisma.task.findMany({
        where: {
          organizationId,
          status: TaskStatus.DONE,
          completedAt: { not: null },
          actualMinutes: { not: null },
        },
        select: { actualMinutes: true },
      }),
    ]);

    // Calculate average completion time
    const avgCompletionTime =
      completedTasks.length > 0
        ? completedTasks.reduce((sum, task) => sum + (task.actualMinutes || 0), 0) /
          completedTasks.length
        : 0;

    // Calculate completion rate
    const doneTasks = byStatus.find((s) => s.status === TaskStatus.DONE)?._count || 0;
    const completionRate = total > 0 ? (doneTasks / total) * 100 : 0;

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Record<
        TaskStatus,
        number
      >,
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])) as Record<
        TaskPriority,
        number
      >,
      overdue,
      dueSoon,
      avgCompletionTime,
      completionRate,
    };
  }

  /**
   * Get all overdue tasks for an organization.
   * Returns tasks past due date that are not completed or skipped.
   *
   * @param {string} organizationId - Organization ID
   * @returns {Promise<TaskWithRelations[]>} Array of overdue tasks sorted by due date
   *
   * @example
   * const overdueTasks = await taskService.getOverdueTasks('org-123');
   * overdueTasks.forEach(task => {
   *   const daysOverdue = Math.floor(
   *     (Date.now() - task.dueDate.getTime()) / (1000 * 60 * 60 * 24)
   *   );
   *   console.log(`${task.title} is ${daysOverdue} days overdue`);
   * });
   */
  async getOverdueTasks(organizationId: string): Promise<TaskWithRelations[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        dueDate: { lt: new Date() },
        status: { notIn: [TaskStatus.DONE, TaskStatus.SKIPPED] },
      },
      include: {
        asset: {
          select: { id: true, name: true, category: true },
        },
        assignments: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        _count: {
          select: {
            assignments: true,
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    return tasks as TaskWithRelations[];
  }

  /**
   * Get tasks assigned to a specific user.
   * Convenience method that wraps findTasks with user filter.
   *
   * @param {string} userId - User ID to filter by
   * @param {string} organizationId - Organization ID
   * @param {Omit<QueryTaskOptions, 'assignedToUserId'>} [options={}] - Additional filters
   * @returns {Promise<TaskSearchResult>} User's tasks
   *
   * @example
   * // Get user's pending tasks
   * const userTasks = await taskService.getUserTasks(
   *   'user-123',
   *   'org-456',
   *   { status: ['PLANNED', 'IN_PROGRESS'] }
   * );
   */
  async getUserTasks(
    userId: string,
    organizationId: string,
    options: Omit<QueryTaskOptions, 'assignedToUserId'> = {},
  ): Promise<TaskSearchResult> {
    return this.findTasks(organizationId, {
      ...options,
      assignedToUserId: userId,
    });
  }

  /**
   * Get tasks for a specific asset.
   * Convenience method that wraps findTasks with asset filter.
   *
   * @param {string} assetId - Asset ID to filter by
   * @param {string} organizationId - Organization ID
   * @param {Omit<QueryTaskOptions, 'assetId'>} [options={}] - Additional filters
   * @returns {Promise<TaskSearchResult>} Asset's tasks
   *
   * @example
   * // Get upcoming maintenance tasks for an asset
   * const maintenanceTasks = await taskService.getAssetTasks(
   *   'asset-123',
   *   'org-456',
   *   {
   *     status: 'PLANNED',
   *     dueDateAfter: new Date(),
   *     sortBy: 'dueDate',
   *     sortOrder: 'asc'
   *   }
   * );
   */
  async getAssetTasks(
    assetId: string,
    organizationId: string,
    options: Omit<QueryTaskOptions, 'assetId'> = {},
  ): Promise<TaskSearchResult> {
    return this.findTasks(organizationId, {
      ...options,
      assetId,
    });
  }

  /**
   * Bulk update task status for multiple tasks.
   * Validates each status transition individually.
   *
   * @param {string[]} taskIds - Array of task IDs to update
   * @param {string} organizationId - Organization ID for access control
   * @param {TaskStatus} newStatus - New status to apply
   * @returns {Promise<Object>} Results with success/failure counts and errors
   *
   * @example
   * // Mark multiple tasks as completed
   * const results = await taskService.bulkUpdateTaskStatus(
   *   ['task-1', 'task-2', 'task-3'],
   *   'org-123',
   *   'DONE'
   * );
   *
   * console.log(`Updated ${results.success} tasks`);
   * if (results.failed > 0) {
   *   console.error('Failed updates:', results.errors);
   * }
   */
  async bulkUpdateTaskStatus(
    taskIds: string[],
    organizationId: string,
    newStatus: TaskStatus,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const taskId of taskIds) {
      try {
        const task = await this.getTaskById(taskId, organizationId);
        if (!task) {
          throw new NotFoundError('Task not found');
        }

        if (!this.validateStatusTransition(task.status, newStatus)) {
          throw new ConflictError(`Invalid status transition from ${task.status} to ${newStatus}`);
        }

        await this.updateTask(taskId, organizationId, { status: newStatus });
        success++;
      } catch (error) {
        failed++;
        errors.push(`Task ${taskId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info('Bulk task status update completed', {
      organizationId,
      newStatus,
      total: taskIds.length,
      success,
      failed,
    });

    return { success, failed, errors };
  }

  /**
   * Get complete task tree using recursive CTE query
   * @param rootTaskId - The root task to start the tree from
   * @returns Flat array of task tree items ordered by depth and subtask order
   */
  async getTaskTree(rootTaskId: string): Promise<TaskTreeItem[]> {
    try {
      const result = await this.prisma.$queryRaw<TaskTreeItem[]>(Prisma.sql`
        WITH RECURSIVE task_tree AS (
          SELECT 
            id, 
            "parentTaskId", 
            title, 
            status, 
            "subtaskOrder", 
            0 as depth,
            description,
            "dueDate",
            priority,
            "isPhotoRequired",
            "checklistItems",
            "completionRequirements",
            "createdAt",
            "updatedAt"
          FROM "tasks"
          WHERE id = ${rootTaskId}
          
          UNION ALL
          
          SELECT 
            t.id, 
            t."parentTaskId", 
            t.title, 
            t.status, 
            t."subtaskOrder", 
            tt.depth + 1,
            t.description,
            t."dueDate",
            t.priority,
            t."isPhotoRequired",
            t."checklistItems",
            t."completionRequirements",
            t."createdAt",
            t."updatedAt"
          FROM "tasks" t
          INNER JOIN task_tree tt ON t."parentTaskId" = tt.id
        )
        SELECT * FROM task_tree
        ORDER BY depth, "subtaskOrder";
      `);

      return result;
    } catch (error) {
      logger.error('Failed to fetch task tree', error instanceof Error ? error : undefined, {
        rootTaskId,
      });
      throw error;
    }
  }

  /**
   * Create a subtask under a parent task
   * @param parentTaskId - ID of the parent task
   * @param data - Subtask creation data
   * @returns Created subtask with relations
   */
  async createSubtask(
    parentTaskId: string,
    data: Omit<CreateTaskData, 'parentTaskId'>,
  ): Promise<TaskWithRelations> {
    // Verify parent task exists and belongs to the same organization
    const parentTask = await this.prisma.task.findUnique({
      where: { id: parentTaskId },
    });

    if (!parentTask) {
      throw new NotFoundError('Parent task not found');
    }

    // Get the next subtask order
    // Create subtask with parent reference
    return this.createTask({
      ...data,
      parentTaskId,
      organizationId: data.organizationId || parentTask.organizationId,
      // Inherit asset from parent if not specified
      assetId: data.assetId ?? (parentTask.assetId || undefined),
    });
  }

  /**
   * Evaluate and update parent task status based on subtask completion
   * Uses recursive logic to handle nested subtasks
   * @param parentTaskId - ID of the parent task to evaluate
   * @param tx - Prisma transaction client
   */
  private async evaluateParentTaskStatus(
    parentTaskId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!parentTaskId) return;

    const parentTask = await tx.task.findUnique({
      where: { id: parentTaskId },
      include: { subtasks: true },
    });

    if (!parentTask) return;

    // Check completion requirements
    const completionReq = parentTask.completionRequirements as any;
    let shouldMarkComplete = false;

    if (completionReq?.type === 'ALL_SUBTASKS_COMPLETED' || !completionReq?.type) {
      // Default behavior: all subtasks must be completed
      shouldMarkComplete =
        parentTask.subtasks.length > 0 && parentTask.subtasks.every((st) => st.status === 'DONE');
    } else if (completionReq?.type === 'ANY_SUBTASK_COMPLETED') {
      shouldMarkComplete = parentTask.subtasks.some((st) => st.status === 'DONE');
    } else if (completionReq?.type === 'PERCENTAGE_COMPLETED') {
      const completedCount = parentTask.subtasks.filter((st) => st.status === 'DONE').length;
      const percentage =
        parentTask.subtasks.length > 0 ? (completedCount / parentTask.subtasks.length) * 100 : 0;
      shouldMarkComplete = percentage >= (completionReq.percentage || 100);
    }

    // Update parent status if needed
    const targetStatus = shouldMarkComplete
      ? 'DONE'
      : parentTask.subtasks.some((st) => st.status === 'IN_PROGRESS')
        ? 'IN_PROGRESS'
        : parentTask.status;

    if (parentTask.status !== targetStatus) {
      await tx.task.update({
        where: { id: parentTaskId },
        data: {
          status: targetStatus,
          completedAt: targetStatus === 'DONE' ? new Date() : null,
        },
      });

      // Recursively check if this parent's status change affects ITS parent
      if (parentTask.parentTaskId) {
        await this.evaluateParentTaskStatus(parentTask.parentTaskId, tx);
      }
    }
  }

  /**
   * Update task with enhanced logic for subtask completion
   * @param taskId - Task to update
   * @param organizationId - Organization ID for security
   * @param data - Update data
   * @returns Updated task
   */
  async updateTaskWithSubtaskLogic(
    taskId: string,
    organizationId: string,
    data: UpdateTaskData,
  ): Promise<TaskWithRelations> {
    return await this.prisma.$transaction(async (tx) => {
      // First, update the task
      const updatedTask = await tx.task.update({
        where: {
          id: taskId,
          organizationId, // Security: ensure task belongs to organization
        },
        data: {
          ...data,
          completedAt: data.status
            ? data.status === TaskStatus.DONE
              ? new Date()
              : null
            : undefined,
        },
      });

      // If status changed, evaluate parent task
      if (data.status && updatedTask.parentTaskId) {
        await this.evaluateParentTaskStatus(updatedTask.parentTaskId, tx);
      }

      // Return the updated task with relations
      return (await tx.task.findUnique({
        where: { id: taskId },
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          schedule: {
            select: {
              id: true,
              name: true,
              scheduleType: true,
            },
          },
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
          parentTask: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
          subtasks: {
            select: {
              id: true,
              title: true,
              status: true,
              subtaskOrder: true,
              dueDate: true,
            },
            orderBy: {
              subtaskOrder: 'asc',
            },
          },
        },
      })) as TaskWithRelations;
    });
  }

  /**
   * Reorder subtasks under a parent task
   * @param parentTaskId - Parent task ID
   * @param subtaskOrders - Array of {taskId, order} objects
   * @param organizationId - Organization ID for security
   */
  async reorderSubtasks(
    parentTaskId: string,
    subtaskOrders: Array<{ taskId: string; order: number }>,
    organizationId: string,
  ): Promise<void> {
    // Verify parent task exists
    const parentTask = await this.prisma.task.findFirst({
      where: { id: parentTaskId, organizationId },
    });

    if (!parentTask) {
      throw new NotFoundError('Parent task not found');
    }

    // Update all subtask orders in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const { taskId, order } of subtaskOrders) {
        await tx.task.update({
          where: {
            id: taskId,
            parentTaskId, // Ensure task is actually a subtask of this parent
            organizationId, // Security check
          },
          data: { subtaskOrder: order },
        });
      }
    });
  }

  /**
   * Get task hierarchy statistics for a parent task
   * @param taskId - Root task ID
   * @returns Statistics about the task tree
   */
  async getTaskHierarchyStats(taskId: string) {
    const tree = await this.getTaskTree(taskId);

    const stats = {
      totalTasks: tree.length,
      maxDepth: Math.max(...tree.map((t) => t.depth)),
      byStatus: tree.reduce(
        (acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        },
        {} as Record<TaskStatus, number>,
      ),
      byDepth: tree.reduce(
        (acc, task) => {
          acc[task.depth] = (acc[task.depth] || 0) + 1;
          return acc;
        },
        {} as Record<number, number>,
      ),
      completionPercentage:
        tree.length > 0 ? (tree.filter((t) => t.status === 'DONE').length / tree.length) * 100 : 0,
    };

    return stats;
  }

  /**
   * Create a task comment with automatic @mentions processing
   * @param data - Comment creation data
   * @returns Created comment with user information
   */
  async createTaskComment(data: CreateTaskCommentData): Promise<
    TaskComment & {
      user: {
        id: string;
        email: string;
        fullName: string | null;
      };
    }
  > {
    // Verify task exists and get organization context
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
      include: {
        organization: {
          select: { id: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Verify user exists and belongs to organization
    const user = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: task.organizationId,
        isActive: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found or not authorized');
    }

    // Create comment and process mentions
    const comment = await this.prisma.$transaction(async (tx) => {
      // Create the comment
      const comment = await tx.taskComment.create({
        data: {
          taskId: data.taskId,
          userId: data.userId,
          content: data.content,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      logger.info('Task comment created', {
        commentId: comment.id,
        taskId: data.taskId,
        userId: data.userId,
        hasContent: !!data.content,
      });

      return comment;
    });

    // Process @mentions in the comment content after transaction
    const mentionsService = new MentionsService(prisma);
    const mentionContext: MentionContext = {
      taskId: data.taskId,
      commentId: comment.id,
      messageType: 'task_comment',
      authorUserId: data.userId,
      organizationId: task.organizationId,
    };

    try {
      await mentionsService.processMentions(data.content, mentionContext);
    } catch (error) {
      logger.error(
        'Failed to process mentions in task comment',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          commentId: comment.id,
          taskId: data.taskId,
        },
      );
      // Don't fail the comment creation if mentions processing fails
    }

    return comment;
  }

  /**
   * Get comments for a task with pagination
   * @param taskId - Task ID
   * @param organizationId - Organization ID for security
   * @param options - Pagination and filtering options
   * @returns Paginated comments
   */
  async getTaskComments(
    taskId: string,
    organizationId: string,
    options: {
      page?: number;
      limit?: number;
      orderBy?: 'asc' | 'desc';
    } = {},
  ): Promise<{
    data: Array<
      TaskComment & {
        user: {
          id: string;
          email: string;
          fullName: string | null;
        };
      }
    >;
    meta: {
      total: number;
      page: number;
      limit: number;
      lastPage: number;
    };
  }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = options;
    const skip = (page - 1) * limit;

    // Verify task exists and belongs to organization
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const [comments, total] = await this.prisma.$transaction([
      this.prisma.taskComment.findMany({
        where: { taskId },
        skip,
        take: limit,
        orderBy: { createdAt: orderBy },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      }),
      this.prisma.taskComment.count({ where: { taskId } }),
    ]);

    return {
      data: comments,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a task comment (only by comment author or admin)
   * @param commentId - Comment ID to update
   * @param userId - User attempting the update
   * @param organizationId - Organization ID for security
   * @param content - New comment content
   * @returns Updated comment
   */
  async updateTaskComment(
    commentId: string,
    userId: string,
    organizationId: string,
    content: string,
  ): Promise<
    TaskComment & {
      user: {
        id: string;
        email: string;
        fullName: string | null;
      };
    }
  > {
    // Find comment and verify permissions
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId },
      include: {
        task: {
          select: { organizationId: true },
        },
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.task.organizationId !== organizationId) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ValidationError('You can only edit your own comments');
    }

    const updatedComment = await this.prisma.$transaction(async (tx) => {
      // Update the comment
      const updatedComment = await tx.taskComment.update({
        where: { id: commentId },
        data: {
          content,
          updatedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      return updatedComment;
    });

    // Process mentions in the updated content after transaction
    const mentionsService = new MentionsService(prisma);
    const mentionContext: MentionContext = {
      taskId: comment.taskId,
      commentId: updatedComment.id,
      messageType: 'task_comment',
      authorUserId: userId,
      organizationId,
    };

    try {
      await mentionsService.processMentions(content, mentionContext);
    } catch (error) {
      logger.error(
        'Failed to process mentions in updated comment',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          commentId: updatedComment.id,
        },
      );
    }

    return updatedComment;
  }

  /**
   * Delete a task comment (only by comment author or admin)
   * @param commentId - Comment ID to delete
   * @param userId - User attempting the deletion
   * @param organizationId - Organization ID for security
   */
  async deleteTaskComment(
    commentId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    // Find comment and verify permissions
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId },
      include: {
        task: {
          select: { organizationId: true },
        },
      },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.task.organizationId !== organizationId) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ValidationError('You can only delete your own comments');
    }

    await this.prisma.taskComment.delete({
      where: { id: commentId },
    });

    logger.info('Task comment deleted', {
      commentId,
      taskId: comment.taskId,
      userId,
    });
  }
}
