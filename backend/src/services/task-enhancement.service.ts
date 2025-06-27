import type { PrismaClient, Task, User } from '@prisma/client';
import { TaskStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import { NotificationService } from './notification.service';
import { ActivityStreamService } from './activity-stream.service';
import { webhookService } from './webhook.service';

interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  completedAt?: Date;
  completedBy?: string;
}

interface CompletionRequirements {
  requirePhoto?: boolean;
  requireChecklist?: boolean;
  requireApproval?: boolean;
  customRequirements?: Record<string, any>;
}

interface SubtaskCreateInput {
  title: string;
  description?: string;
  dueDate: Date;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedMinutes?: number;
  assignUserIds?: string[];
  order?: number;
}

export class TaskEnhancementService {
  private notificationService: NotificationService;
  private activityStreamService: ActivityStreamService;

  constructor(private prisma: PrismaClient) {
    this.notificationService = new NotificationService(prisma);
    this.activityStreamService = new ActivityStreamService(prisma);
  }

  /**
   * Update task with multiple user assignments
   */
  async updateTaskAssignments(
    taskId: string,
    organizationId: string,
    userIds: string[],
    assignedBy: string,
  ): Promise<Task & { assignments: Array<{ user: User }> }> {
    // Validate all users exist and belong to organization
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        organizationId,
      },
    });

    if (users.length !== userIds.length) {
      throw new ValidationError('One or more users not found or not in organization');
    }

    // Get current assignments
    const currentAssignments = await this.prisma.taskAssignment.findMany({
      where: { taskId },
      select: { userId: true },
    });

    const currentUserIds = new Set(currentAssignments.map((a) => a.userId));
    const newUserIds = new Set(userIds);

    // Find users to add and remove
    const usersToAdd = userIds.filter((id) => !currentUserIds.has(id));
    const usersToRemove = Array.from(currentUserIds).filter((id) => !newUserIds.has(id));

    // Remove assignments
    if (usersToRemove.length > 0) {
      await this.prisma.taskAssignment.deleteMany({
        where: {
          taskId,
          userId: { in: usersToRemove },
        },
      });
    }

    // Add new assignments
    if (usersToAdd.length > 0) {
      await this.prisma.taskAssignment.createMany({
        data: usersToAdd.map((userId) => ({
          taskId,
          userId,
        })),
      });
    }

    // Get updated task with assignments
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignments: {
          include: { user: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Send notifications to newly assigned users
    for (const userId of usersToAdd) {
      await this.notificationService.createNotification({
        organizationId,
        userId,
        taskId,
        type: 'task-assigned',
        title: 'New Task Assignment',
        message: `You have been assigned to task: ${task.title}`,
        sendInApp: true,
        sendEmail: true,
      });
    }

    // Log activity
    if (assignedBy) {
      const assignedByUser = await this.prisma.user.findUnique({
        where: { id: assignedBy },
        select: { id: true, email: true, fullName: true },
      });

      await this.activityStreamService.emitActivity({
        organizationId,
        actor: {
          type: 'User',
          id: assignedBy,
          name: assignedByUser?.fullName || assignedByUser?.email || 'System',
        },
        verb: 'assigned',
        object: {
          type: 'Task',
          id: taskId,
          displayName: task.title,
        },
        metadata: {
          assignedUsers: usersToAdd,
          unassignedUsers: usersToRemove,
        },
      });
    }

    return task;
  }

  /**
   * Create subtasks for a parent task
   */
  async createSubtasks(
    parentTaskId: string,
    organizationId: string,
    subtasks: SubtaskCreateInput[],
    createdBy: string,
  ): Promise<Task[]> {
    // Verify parent task exists
    const parentTask = await this.prisma.task.findFirst({
      where: {
        id: parentTaskId,
        organizationId,
      },
    });

    if (!parentTask) {
      throw new NotFoundError('Parent task not found');
    }

    // Create subtasks
    const createdSubtasks: Task[] = [];

    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      if (!subtask) continue;

      const created = await this.prisma.task.create({
        data: {
          organizationId,
          parentTaskId,
          title: subtask.title,
          description: subtask.description,
          dueDate: subtask.dueDate,
          priority: subtask.priority || 'MEDIUM',
          estimatedMinutes: subtask.estimatedMinutes,
          subtaskOrder: subtask.order || i,
          assetId: parentTask.assetId,
          scheduleId: parentTask.scheduleId,
        },
      });

      // Assign users if specified
      if (subtask.assignUserIds && subtask.assignUserIds.length > 0) {
        await this.prisma.taskAssignment.createMany({
          data: subtask.assignUserIds.map((userId) => ({
            taskId: created.id,
            userId,
          })),
        });
      }

      createdSubtasks.push(created);
    }

    // Log activity
    if (createdBy) {
      const createdByUser = await this.prisma.user.findUnique({
        where: { id: createdBy },
        select: { id: true, email: true, fullName: true },
      });

      const parentTask = await this.prisma.task.findUnique({
        where: { id: parentTaskId },
        select: { title: true },
      });

      await this.activityStreamService.emitActivity({
        organizationId,
        actor: {
          type: 'User',
          id: createdBy,
          name: createdByUser?.fullName || createdByUser?.email || 'System',
        },
        verb: 'created',
        object: {
          type: 'Task',
          id: parentTaskId,
          displayName: `${createdSubtasks.length} subtasks for ${parentTask?.title || 'task'}`,
        },
        metadata: {
          subtasksCreated: createdSubtasks.length,
          subtaskIds: createdSubtasks.map((t) => t.id),
        },
      });
    }

    return createdSubtasks;
  }

  /**
   * Update task completion requirements
   */
  async updateCompletionRequirements(
    taskId: string,
    organizationId: string,
    requirements: CompletionRequirements,
  ): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId,
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        completionRequirements: requirements as any,
        isPhotoRequired: requirements.requirePhoto || false,
      },
    });

    return updated;
  }

  /**
   * Update task checklist
   */
  async updateChecklist(
    taskId: string,
    organizationId: string,
    checklist: ChecklistItem[],
    updatedBy: string,
  ): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId,
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        checklistItems: checklist as any,
      },
    });

    // Log activity
    if (updatedBy) {
      const updatedByUser = await this.prisma.user.findUnique({
        where: { id: updatedBy },
        select: { id: true, email: true, fullName: true },
      });

      await this.activityStreamService.emitActivity({
        organizationId,
        actor: {
          type: 'User',
          id: updatedBy,
          name: updatedByUser?.fullName || updatedByUser?.email || 'System',
        },
        verb: 'updated',
        object: {
          type: 'Task',
          id: taskId,
          displayName: updated.title,
        },
        metadata: {
          checklistUpdated: true,
          itemCount: checklist.length,
          completedCount: checklist.filter((item) => item.isCompleted).length,
        },
      });
    }

    return updated;
  }

  /**
   * Check if task completion requirements are met
   */
  async checkCompletionRequirements(taskId: string): Promise<{
    canComplete: boolean;
    missingRequirements: string[];
  }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        attachments: true,
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const requirements = task.completionRequirements as CompletionRequirements | null;
    const missingRequirements: string[] = [];

    if (!requirements) {
      return { canComplete: true, missingRequirements: [] };
    }

    // Check photo requirement
    if (requirements.requirePhoto) {
      const hasPhoto = task.attachments.some((att) => att.mimeType.startsWith('image/'));
      if (!hasPhoto) {
        missingRequirements.push('Photo attachment required');
      }
    }

    // Check checklist requirement
    if (requirements.requireChecklist) {
      const checklist = task.checklistItems as ChecklistItem[] | null;
      if (!checklist || checklist.length === 0) {
        missingRequirements.push('Checklist must be completed');
      } else {
        const allCompleted = checklist.every((item) => item.isCompleted);
        if (!allCompleted) {
          missingRequirements.push('All checklist items must be completed');
        }
      }
    }

    // Check custom requirements
    if (requirements.customRequirements) {
      // This can be extended based on specific business needs
      // For now, we'll just log that custom requirements exist
      logger.debug('Custom requirements exist for task', {
        taskId,
        customRequirements: requirements.customRequirements,
      });
    }

    return {
      canComplete: missingRequirements.length === 0,
      missingRequirements,
    };
  }

  /**
   * Complete a task with validation
   */
  async completeTask(
    taskId: string,
    organizationId: string,
    completedBy: string,
    actualCost?: number,
    actualMinutes?: number,
    notes?: string,
  ): Promise<Task> {
    // Check if task can be completed
    const { canComplete, missingRequirements } = await this.checkCompletionRequirements(taskId);

    if (!canComplete) {
      throw new ValidationError(
        `Task cannot be completed. Missing requirements: ${missingRequirements.join(', ')}`,
      );
    }

    // Check if all subtasks are completed
    const incompleteSubtasks = await this.prisma.task.count({
      where: {
        parentTaskId: taskId,
        status: {
          notIn: ['DONE', 'SKIPPED'],
        },
      },
    });

    if (incompleteSubtasks > 0) {
      throw new ValidationError(
        `Task cannot be completed. ${incompleteSubtasks} subtask(s) are not completed`,
      );
    }

    // Complete the task
    const completed = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.DONE,
        completedAt: new Date(),
        actualCost,
        actualMinutes,
      },
    });

    // Add completion note if provided
    if (notes) {
      await this.prisma.taskComment.create({
        data: {
          taskId,
          userId: completedBy,
          content: `Task completed. ${notes}`,
        },
      });
    }

    // Log activity
    if (completedBy) {
      const completedByUser = await this.prisma.user.findUnique({
        where: { id: completedBy },
        select: { id: true, email: true, fullName: true },
      });

      await this.activityStreamService.emitActivity({
        organizationId,
        actor: {
          type: 'User',
          id: completedBy,
          name: completedByUser?.fullName || completedByUser?.email || 'System',
        },
        verb: 'completed',
        object: {
          type: 'Task',
          id: taskId,
          displayName: completed.title,
        },
        metadata: {
          actualCost,
          actualMinutes,
          notes,
        },
      });
    }

    // Send notifications
    const assignments = await this.prisma.taskAssignment.findMany({
      where: { taskId },
      select: { userId: true },
    });

    for (const assignment of assignments) {
      if (assignment.userId !== completedBy) {
        await this.notificationService.createNotification({
          organizationId,
          userId: assignment.userId,
          taskId,
          type: 'task-completed',
          title: 'Task Completed',
          message: `Task "${completed.title}" has been completed`,
          sendInApp: true,
        });
      }
    }

    // Emit webhook event
    try {
      const taskDetails = await this.prisma.task.findUnique({
        where: { id: taskId },
        include: {
          asset: true,
          schedule: true,
        },
      });

      await webhookService.emitEvent({
        id: `task-completed-${taskId}-${Date.now()}`,
        type: 'task.completed',
        organizationId,
        timestamp: new Date(),
        data: {
          taskId,
          title: completed.title,
          status: completed.status,
          completedAt: completed.completedAt,
          completedBy,
          assetId: taskDetails?.assetId,
          assetName: taskDetails?.asset?.name,
          scheduleId: taskDetails?.scheduleId,
          scheduleName: taskDetails?.schedule?.name,
          actualCost,
          actualMinutes,
          estimatedMinutes: taskDetails?.estimatedMinutes,
          dueDate: taskDetails?.dueDate,
        },
        userId: completedBy,
        metadata: {
          source: 'task-enhancement-service',
          action: 'complete',
          notes,
        },
      });
    } catch (error) {
      // Log but don't fail the primary operation
      logger.error(
        'Failed to emit task.completed webhook event',
        error instanceof Error ? error : new Error('Unknown error'),
      );
    }

    return completed;
  }

  /**
   * Get task hierarchy (parent with all subtasks)
   */
  async getTaskHierarchy(
    taskId: string,
    organizationId: string,
  ): Promise<Task & { subtasks: Task[] }> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId,
      },
      include: {
        subtasks: {
          orderBy: {
            subtaskOrder: 'asc',
          },
          include: {
            assignments: {
              include: {
                user: true,
              },
            },
          },
        },
        assignments: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    return task;
  }

  /**
   * Reorder subtasks
   */
  async reorderSubtasks(
    parentTaskId: string,
    organizationId: string,
    orderedTaskIds: string[],
  ): Promise<void> {
    // Verify parent task exists
    const parentTask = await this.prisma.task.findFirst({
      where: {
        id: parentTaskId,
        organizationId,
      },
    });

    if (!parentTask) {
      throw new NotFoundError('Parent task not found');
    }

    // Verify all subtasks exist and belong to parent
    const subtasks = await this.prisma.task.findMany({
      where: {
        id: { in: orderedTaskIds },
        parentTaskId,
      },
    });

    if (subtasks.length !== orderedTaskIds.length) {
      throw new ValidationError('Invalid subtask IDs provided');
    }

    // Update order
    const updates = orderedTaskIds.map((taskId, index) =>
      this.prisma.task.update({
        where: { id: taskId },
        data: { subtaskOrder: index },
      }),
    );

    await this.prisma.$transaction(updates);
  }

  /**
   * Get tasks by multiple assignees
   */
  async getTasksByAssignees(
    organizationId: string,
    userIds: string[],
    options: {
      status?: TaskStatus[];
      dueDateFrom?: Date;
      dueDateTo?: Date;
      includeSubtasks?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    data: Task[];
    meta: {
      total: number;
      page: number;
      lastPage: number;
    };
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      organizationId,
      assignments: {
        some: {
          userId: { in: userIds },
        },
      },
    };

    if (!options.includeSubtasks) {
      whereClause.parentTaskId = null;
    }

    if (options.status) {
      whereClause.status = { in: options.status };
    }

    if (options.dueDateFrom || options.dueDateTo) {
      whereClause.dueDate = {};
      if (options.dueDateFrom) {
        whereClause.dueDate.gte = options.dueDateFrom;
      }
      if (options.dueDateTo) {
        whereClause.dueDate.lte = options.dueDateTo;
      }
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where: whereClause,
        include: {
          assignments: {
            include: {
              user: true,
            },
          },
          asset: true,
          parentTask: true,
          subtasks: options.includeSubtasks ? true : undefined,
        },
        orderBy: {
          dueDate: 'asc',
        },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where: whereClause }),
    ]);

    return {
      data: tasks,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
