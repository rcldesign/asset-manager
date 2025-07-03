import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { Task, Organization, User, Asset, Schedule } from '@prisma/client';
import { TaskStatus } from '@prisma/client';
import { NotFoundError, ConflictError, ValidationError } from '../../../utils/errors';

// Enable automatic mocking for Prisma
jest.mock('../../../lib/prisma');

// Import modules after mocking
import { TaskService } from '../../../services/task.service';
import { prisma } from '../../../lib/prisma';

// Type the mocked modules
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));


describe('TaskService', () => {
  let taskService: TaskService;

  // Mock data
  const mockOrganization: Organization = {
    id: 'org-1',
    name: 'Test Organization',
    ownerUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hash',
    role: 'MEMBER',
    fullName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    lastActiveAt: null,
    organizationId: 'org-1',
    totpSecret: null,
    totpEnabled: false,
    emailVerified: true,
    isActive: true,
    notificationPreferences: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAsset: Asset = {
    id: 'asset-1',
    organizationId: 'org-1',
    name: 'Test Asset',
    category: 'HARDWARE',
    status: 'OPERATIONAL',
    assetTemplateId: null,
    locationId: null,
    parentId: null,
    path: '/asset-1',
    manufacturer: null,
    modelNumber: null,
    serialNumber: null,
    purchaseDate: null,
    purchasePrice: null,
    description: null,
    link: null,
    tags: [],
    warrantyScope: null,
    warrantyExpiry: null,
    warrantyLifetime: false,
    secondaryWarrantyScope: null,
    secondaryWarrantyExpiry: null,
    customFields: null,
    photoPath: null,
    receiptPath: null,
    manualPath: null,
    qrCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSchedule: Schedule = {
    id: 'schedule-1',
    organizationId: 'org-1',
    assetId: 'asset-1',
    name: 'Test Schedule',
    description: null,
    scheduleType: 'FIXED_INTERVAL',
    type: null,
    startDate: new Date(),
    endDate: null,
    intervalDays: 30,
    intervalMonths: null,
    customRrule: null,
    recurrenceRule: null,
    monthlyDayOfMonth: null,
    seasonalMonths: null,
    usageThreshold: null,
    currentUsage: 0,
    lastRunAt: null,
    nextRunAt: null,
    nextOccurrence: new Date(),
    lastOccurrence: null,
    isActive: true,
    taskTemplate: {},
    autoCreateAdvance: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTask: Task = {
    id: 'task-1',
    organizationId: 'org-1',
    assetId: 'asset-1',
    scheduleId: null,
    title: 'Test Task',
    description: 'Test description',
    dueDate: new Date(),
    status: 'PLANNED',
    priority: 'MEDIUM',
    estimatedCost: null,
    actualCost: null,
    estimatedMinutes: 60,
    actualMinutes: null,
    completedAt: null,
    skippedAt: null,
    parentTaskId: null,
    subtaskOrder: 0,
    completionRequirements: null,
    isPhotoRequired: false,
    checklistItems: null,
    googleEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    taskService = new TaskService(mockPrisma);
    jest.clearAllMocks();

    // Set up default mock for $transaction
    (mockPrisma.$transaction as any).mockImplementation(async (queries: any) => {
      if (Array.isArray(queries)) {
        // Default behavior - return empty results
        return queries.map(() => []);
      }
      if (typeof queries === 'function') {
        return queries(mockPrisma);
      }
      throw new Error('Unexpected transaction call');
    });
  });

  describe('createTask', () => {
    test('should create a task successfully', async () => {
      const createData = {
        organizationId: 'org-1',
        title: 'New Task',
        description: 'Task description',
        dueDate: new Date(),
        assetId: 'asset-1',
        assignUserIds: ['user-1'],
      };

      const mockCreatedTask: any = {
        ...mockTask,
        id: 'new-task',
        title: 'New Task',
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [
          {
            id: 'assignment-1',
            taskId: 'new-task',
            userId: 'user-1',
            assignedAt: new Date(),
            user: { id: 'user-1', email: 'test@example.com', fullName: 'Test User' },
          },
        ],
        _count: { assignments: 1, comments: 0, attachments: 0 },
      };

      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization);
      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      (mockPrisma.$transaction as any).mockImplementation(async (callback: any) => {
        const createFn = jest.fn() as any;
        createFn.mockResolvedValue(mockCreatedTask);
        const findUniqueFn = jest.fn() as any;
        findUniqueFn.mockResolvedValue(mockCreatedTask);
        const createManyFn = jest.fn() as any;

        const tx: any = {
          task: {
            create: createFn,
            findUnique: findUniqueFn,
          },
          taskAssignment: { createMany: createManyFn },
        };
        return await callback(tx);
      });

      const result = await taskService.createTask(createData);

      expect(result).toEqual(mockCreatedTask);
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
      });
      expect(mockPrisma.asset.findFirst).toHaveBeenCalledWith({
        where: { id: 'asset-1', organizationId: 'org-1' },
      });
    });

    test('should throw NotFoundError when organization does not exist', async () => {
      const createData = {
        organizationId: 'nonexistent-org',
        title: 'New Task',
        dueDate: new Date(),
      };

      (mockPrisma.organization.findUnique as any).mockResolvedValue(null);

      await expect(taskService.createTask(createData)).rejects.toThrow(NotFoundError);
    });

    test('should throw NotFoundError when asset does not exist', async () => {
      const createData = {
        organizationId: 'org-1',
        title: 'New Task',
        dueDate: new Date(),
        assetId: 'nonexistent-asset',
      };

      (mockPrisma.organization.findUnique as any).mockResolvedValue(mockOrganization);
      (mockPrisma.asset.findFirst as any).mockResolvedValue(null);

      await expect(taskService.createTask(createData)).rejects.toThrow(NotFoundError);
    });

    test('should throw ValidationError when assigned user does not exist', async () => {
      const createData = {
        organizationId: 'org-1',
        title: 'New Task',
        dueDate: new Date(),
        assignUserIds: ['nonexistent-user'],
      };

      (mockPrisma.organization.findUnique as any).mockResolvedValue(mockOrganization);
      (mockPrisma.user.findMany as any).mockResolvedValue([]);

      await expect(taskService.createTask(createData)).rejects.toThrow(ValidationError);
    });
  });

  describe('getTaskById', () => {
    test('should return task with relations', async () => {
      const mockTaskWithRelations = {
        ...mockTask,
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        schedule: null,
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      (mockPrisma.task.findFirst as any).mockResolvedValue(mockTaskWithRelations);

      const result = await taskService.getTaskById('task-1', 'org-1');

      expect(result).toEqual(mockTaskWithRelations);
      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', organizationId: 'org-1' },
        include: expect.objectContaining({
          asset: { select: { id: true, name: true, category: true } },
          assignments: expect.any(Object),
          _count: expect.any(Object),
        }),
      });
    });

    test('should return null when task not found', async () => {
      (mockPrisma.task.findFirst as any).mockResolvedValue(null);

      const result = await taskService.getTaskById('nonexistent-task', 'org-1');

      expect(result).toBeNull();
    });
  });

  describe('updateTask', () => {
    test('should update task successfully', async () => {
      const updateData = {
        title: 'Updated Task',
        status: 'IN_PROGRESS' as TaskStatus,
      };

      const mockExistingTask = {
        ...mockTask,
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      const mockUpdatedTask = {
        ...mockExistingTask,
        title: 'Updated Task',
        status: 'IN_PROGRESS',
      };

      (mockPrisma.task.findFirst as any).mockResolvedValue(mockExistingTask);
      (mockPrisma.task.update as any).mockResolvedValue(mockUpdatedTask);

      const result = await taskService.updateTask('task-1', 'org-1', updateData);

      expect(result).toEqual(mockUpdatedTask);
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          title: 'Updated Task',
          status: 'IN_PROGRESS',
        }),
        include: expect.any(Object),
      });
    });

    test('should throw NotFoundError when task does not exist', async () => {
      (mockPrisma.task.findFirst as any).mockResolvedValue(null);

      await expect(
        taskService.updateTask('nonexistent-task', 'org-1', { title: 'New Title' }),
      ).rejects.toThrow(NotFoundError);
    });

    test('should throw ConflictError for invalid status transition', async () => {
      const mockExistingTask = {
        ...mockTask,
        status: 'DONE',
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      (mockPrisma.task.findFirst as any).mockResolvedValue(mockExistingTask);

      await expect(
        taskService.updateTask('task-1', 'org-1', { status: 'PLANNED' as TaskStatus }),
      ).rejects.toThrow(ConflictError);
    });

    test('should set completedAt when status changes to DONE', async () => {
      const mockExistingTask = {
        ...mockTask,
        status: 'IN_PROGRESS',
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      const mockUpdatedTask = {
        ...mockExistingTask,
        status: 'DONE',
        completedAt: new Date(),
      };

      (mockPrisma.task.findFirst as any).mockResolvedValue(mockExistingTask);
      (mockPrisma.task.update as any).mockResolvedValue(mockUpdatedTask);

      await taskService.updateTask('task-1', 'org-1', { status: 'DONE' as TaskStatus });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: 'DONE',
          completedAt: expect.any(Date),
          skippedAt: null,
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('deleteTask', () => {
    test('should delete task successfully', async () => {
      const mockTaskForDelete = {
        ...mockTask,
        scheduleId: null,
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      (mockPrisma.task.findFirst as any).mockResolvedValue(mockTaskForDelete);
      (mockPrisma.task.delete as any).mockResolvedValue(mockTask);

      await taskService.deleteTask('task-1', 'org-1');

      expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
    });

    test('should throw NotFoundError when task does not exist', async () => {
      (mockPrisma.task.findFirst as any).mockResolvedValue(null);

      await expect(taskService.deleteTask('nonexistent-task', 'org-1')).rejects.toThrow(
        NotFoundError,
      );
    });

    test('should throw ConflictError when trying to delete task with active schedule', async () => {
      const mockTaskWithActiveSchedule = {
        ...mockTask,
        scheduleId: 'schedule-1',
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      (mockPrisma.task.findFirst as any).mockResolvedValue(mockTaskWithActiveSchedule);
      (mockPrisma.schedule.findFirst as any).mockResolvedValue({ ...mockSchedule, isActive: true });

      await expect(taskService.deleteTask('task-1', 'org-1')).rejects.toThrow(ConflictError);
    });
  });

  describe('findTasks', () => {
    test('should return paginated tasks with filters', async () => {
      const mockTasks = [
        {
          ...mockTask,
          asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
          assignments: [],
          _count: { assignments: 0, comments: 0, attachments: 0 },
        },
      ];

      // Mock Prisma methods
      (mockPrisma.task.findMany as any).mockReturnValue({
        then: (resolve: any) => resolve(mockTasks),
      });
      (mockPrisma.task.count as any).mockReturnValue({ then: (resolve: any) => resolve(1) });

      // Mock the $transaction to return array results
      (mockPrisma.$transaction as any).mockImplementation(async (queries: any) => {
        if (Array.isArray(queries)) {
          // Execute the promise-like objects
          return Promise.all(queries);
        }
        throw new Error('Unexpected transaction call');
      });

      const result = await taskService.findTasks('org-1', {
        page: 1,
        limit: 10,
        status: 'PLANNED',
      });

      expect(result).toEqual({
        data: mockTasks,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          lastPage: 1,
        },
      });
    });

    test('should apply overdue filter correctly', async () => {
      const mockTasks = [
        {
          ...mockTask,
          dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
          assignments: [],
          _count: { assignments: 0, comments: 0, attachments: 0 },
        },
      ];

      // Mock Prisma methods
      (mockPrisma.task.findMany as any).mockReturnValue({
        then: (resolve: any) => resolve(mockTasks),
      });
      (mockPrisma.task.count as any).mockReturnValue({ then: (resolve: any) => resolve(1) });

      // Mock the $transaction to return array results
      (mockPrisma.$transaction as any).mockImplementation(async (queries: any) => {
        if (Array.isArray(queries)) {
          // Execute the promise-like objects
          return Promise.all(queries);
        }
        throw new Error('Unexpected transaction call');
      });

      await taskService.findTasks('org-1', { isOverdue: true });

      // Check that findMany was called with correct overdue filter
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([
              { organizationId: 'org-1' },
              {
                dueDate: { lt: expect.any(Date) },
                status: { notIn: [TaskStatus.DONE, TaskStatus.SKIPPED] },
              },
            ]),
          },
        }),
      );
    });
  });

  describe('assignUsersToTask', () => {
    test('should assign users to task successfully', async () => {
      const mockTaskForAssignment = {
        ...mockTask,
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      const mockUpdatedTask = {
        ...mockTaskForAssignment,
        assignments: [
          {
            id: 'assignment-1',
            taskId: 'task-1',
            userId: 'user-1',
            assignedAt: new Date(),
            user: { id: 'user-1', email: 'test@example.com', fullName: 'Test User' },
          },
        ],
        _count: { assignments: 1, comments: 0, attachments: 0 },
      };

      (mockPrisma.task.findFirst as any)
        .mockResolvedValueOnce(mockTaskForAssignment) // First call for validation
        .mockResolvedValueOnce(mockUpdatedTask); // Second call for return value

      (mockPrisma.user.findMany as any).mockResolvedValue([mockUser]);
      (mockPrisma.$transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          taskAssignment: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

      const result = await taskService.assignUsersToTask('task-1', 'org-1', ['user-1']);

      expect(result).toEqual(mockUpdatedTask);
    });

    test('should throw ValidationError when user does not exist', async () => {
      const mockTaskForAssignment = {
        ...mockTask,
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      (mockPrisma.task.findFirst as any).mockResolvedValue(mockTaskForAssignment);
      (mockPrisma.user.findMany as any).mockResolvedValue([]);

      await expect(
        taskService.assignUsersToTask('task-1', 'org-1', ['nonexistent-user']),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('addTaskComment', () => {
    test('should add comment to task successfully', async () => {
      const commentData = {
        taskId: 'task-1',
        userId: 'user-1',
        content: 'Test comment',
      };

      const mockCreatedComment = {
        id: 'comment-1',
        taskId: 'task-1',
        userId: 'user-1',
        content: 'Test comment',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'user-1', email: 'test@example.com', fullName: 'Test User' },
      };

      (mockPrisma.task.findUnique as any).mockResolvedValue({
        ...mockTask,
        organizationId: mockOrganization.id,
        organization: mockOrganization,
      });
      (mockPrisma.user.findFirst as any).mockResolvedValue(mockUser);
      (mockPrisma.taskComment.create as any).mockResolvedValue(mockCreatedComment);

      const result = await taskService.createTaskComment(commentData);

      expect(result).toEqual(mockCreatedComment);
      expect(mockPrisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          userId: 'user-1',
          content: 'Test comment',
        },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      });
    });

    test('should throw NotFoundError when task does not exist', async () => {
      const commentData = {
        taskId: 'nonexistent-task',
        userId: 'user-1',
        content: 'Test comment',
      };

      (mockPrisma.task.findUnique as any).mockResolvedValue(null);

      await expect(taskService.createTaskComment(commentData)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getTaskStatistics', () => {
    test('should return comprehensive task statistics', async () => {
      // Mock individual Prisma calls
      (mockPrisma.task.count as any).mockResolvedValueOnce(5); // total
      (mockPrisma.task.groupBy as any)
        .mockResolvedValueOnce([
          { status: 'PLANNED', _count: 2 },
          { status: 'DONE', _count: 3 },
        ]) // byStatus
        .mockResolvedValueOnce([
          { priority: 'HIGH', _count: 1 },
          { priority: 'MEDIUM', _count: 4 },
        ]); // byPriority
      (mockPrisma.task.count as any)
        .mockResolvedValueOnce(1) // overdue
        .mockResolvedValueOnce(2); // dueSoon
      (mockPrisma.task.findMany as any).mockResolvedValueOnce([
        { actualMinutes: 60 },
        { actualMinutes: 120 },
      ]); // completedTasks

      const result = await taskService.getTaskStatistics('org-1');

      expect(result).toEqual({
        total: 5,
        byStatus: { PLANNED: 2, DONE: 3 },
        byPriority: { HIGH: 1, MEDIUM: 4 },
        overdue: 1,
        dueSoon: 2,
        avgCompletionTime: 90, // (60 + 120) / 2
        completionRate: 60, // (3 / 5) * 100
      });
    });
  });

  describe('bulkUpdateTaskStatus', () => {
    test('should update multiple tasks successfully', async () => {
      const taskIds = ['task-1', 'task-2'];
      const newStatus: TaskStatus = 'IN_PROGRESS';

      const mockExistingTask = {
        ...mockTask,
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      // Mock getTaskById to return existing task
      jest.spyOn(taskService, 'getTaskById').mockResolvedValue(mockExistingTask);

      // Mock updateTask to succeed
      jest.spyOn(taskService, 'updateTask').mockResolvedValue({
        ...mockExistingTask,
        status: newStatus,
      });

      const result = await taskService.bulkUpdateTaskStatus(taskIds, 'org-1', newStatus);

      expect(result).toEqual({
        success: 2,
        failed: 0,
        errors: [],
      });
    });

    test('should handle mixed success and failure', async () => {
      const taskIds = ['task-1', 'nonexistent-task'];
      const newStatus: TaskStatus = 'IN_PROGRESS';

      const mockExistingTask = {
        ...mockTask,
        asset: { id: 'asset-1', name: 'Test Asset', category: 'HARDWARE' },
        assignments: [],
        _count: { assignments: 0, comments: 0, attachments: 0 },
      };

      // Mock getTaskById to return task for first ID, null for second
      jest
        .spyOn(taskService, 'getTaskById')
        .mockResolvedValueOnce(mockExistingTask)
        .mockResolvedValueOnce(null);

      // Mock updateTask to succeed for valid task
      jest.spyOn(taskService, 'updateTask').mockResolvedValue({
        ...mockExistingTask,
        status: newStatus,
      });

      const result = await taskService.bulkUpdateTaskStatus(taskIds, 'org-1', newStatus);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('nonexistent-task');
    });
  });
});
