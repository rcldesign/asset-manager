jest.mock('../../../lib/prisma');

import { DashboardService } from '../../../services/dashboard.service';
import { DashboardTimeRange } from '../../../types/dashboard';
import { AssetCategory, AssetStatus, TaskStatus, TaskPriority, Prisma, UserRole } from '@prisma/client';
const { Decimal } = Prisma;
import { subDays, startOfMonth, endOfMonth } from 'date-fns';
import type { IRequestContext } from '../../../interfaces/context.interface';
import { prisma } from '../../../lib/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('DashboardService', () => {
  let dashboardService: DashboardService;
  const mockOrganizationId = 'org-123';
  
  const mockContext: IRequestContext = {
    userId: 'user-123',
    userRole: UserRole.MEMBER,
    organizationId: mockOrganizationId,
    requestId: 'req-123',
  };

  beforeEach(() => {
    dashboardService = new DashboardService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('getOverviewDashboard', () => {
    it('should return overview dashboard data with summary cards', async () => {
      // Mock responses
      mockPrisma.asset.count
        .mockResolvedValueOnce(100) // totalAssets
        .mockResolvedValueOnce(85); // activeAssets

      mockPrisma.task.count
        .mockResolvedValueOnce(200) // totalTasks
        .mockResolvedValueOnce(50) // openTasks
        .mockResolvedValueOnce(15) // overdueTasks
        .mockResolvedValueOnce(25) // tasksCreatedInPeriod
        .mockResolvedValueOnce(20); // tasksCompletedInPeriod

      mockPrisma.user.count
        .mockResolvedValueOnce(10) // totalUsers
        .mockResolvedValueOnce(8); // activeUsers

      mockPrisma.asset.aggregate.mockResolvedValueOnce({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: new Decimal(500000) },
      } as any);

      mockPrisma.asset.count
        .mockResolvedValueOnce(5) // assetsAddedInPeriod
        .mockResolvedValueOnce(3); // assetsUpdatedInPeriod

      mockPrisma.activityStream.findMany.mockResolvedValueOnce([
        {
          id: 'activity-1',
          userId: 'user-1',
          organizationId: 'org-123',
          action: 'CREATE',
          entityType: 'TASK',
          entityId: 'task-1',
          entityName: 'Test Task',
          metadata: {},
          createdAt: new Date(),
        },
      ]);

      mockPrisma.task.findMany
        .mockResolvedValueOnce([
          {
            id: 'task-1',
            organizationId: 'org-123',
            title: 'Urgent Maintenance',
            description: 'Urgent maintenance task',
            dueDate: new Date(),
            status: TaskStatus.PLANNED,
            priority: TaskPriority.HIGH,
            assetId: 'asset-1',
            scheduleId: null,
            parentTaskId: null,
            subtaskOrder: 0,
            estimatedCost: null,
            actualCost: null,
            estimatedMinutes: 60,
            actualMinutes: null,
            completedAt: null,
            skippedAt: null,
            completionRequirements: null,
            isPhotoRequired: false,
            checklistItems: null,
            googleEventId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'task-2',
            organizationId: 'org-123',
            title: 'Completed Task',
            description: 'A completed task',
            dueDate: new Date(),
            status: TaskStatus.DONE,
            priority: TaskPriority.MEDIUM,
            assetId: null,
            scheduleId: null,
            parentTaskId: null,
            subtaskOrder: 0,
            estimatedCost: null,
            actualCost: null,
            estimatedMinutes: 30,
            actualMinutes: 25,
            completedAt: new Date(),
            skippedAt: null,
            completionRequirements: null,
            isPhotoRequired: false,
            checklistItems: null,
            googleEventId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

      mockPrisma.asset.findMany.mockResolvedValueOnce([
        {
          id: 'asset-1',
          organizationId: mockOrganizationId,
          name: 'Server A',
          category: AssetCategory.EQUIPMENT,
          description: 'Test server',
          customFields: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          link: null,
          warrantyExpiry: subDays(new Date(), -15),
          warrantyLifetime: false,
          secondaryWarrantyExpiry: null,
          status: AssetStatus.OPERATIONAL,
          locationId: null,
          assetTemplateId: null,
          parentId: null,
          manufacturer: null,
          modelNumber: null,
          serialNumber: null,
          purchaseDate: null,
          purchasePrice: null,
          warrantyScope: null,
          secondaryWarrantyScope: null,
          qrCode: null,
          path: '/asset-1',
          tags: [],
        },
      ] as any);

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.THIS_MONTH,
      };

      const result = await dashboardService.getOverviewDashboard(mockContext, request);

      expect(result.data.summaryCards.totalAssets).toBe(100);
      expect(result.data.summaryCards.activeAssets).toBe(85);
      expect(result.data.summaryCards.totalTasks).toBe(200);
      expect(result.data.summaryCards.openTasks).toBe(50);
      expect(result.data.summaryCards.overdueTasks).toBe(15);
      expect(result.data.summaryCards.totalUsers).toBe(10);
      expect(result.data.summaryCards.activeUsers).toBe(8);
      expect(result.data.summaryCards.totalValue).toBe(500000);

      expect(result.data.activityMetrics.tasksCreatedCount).toBe(25);
      expect(result.data.activityMetrics.tasksCompletedCount).toBe(20);
      expect(result.data.activityMetrics.assetsAddedCount).toBe(5);
      expect(result.data.activityMetrics.assetsUpdatedCount).toBe(3);

      expect(result.data.recentActivity).toHaveLength(1);
      expect(result.data.quickActions.urgentTasks).toHaveLength(1);
      expect(result.data.quickActions.warrantyAlerts).toHaveLength(1);

      expect(result.metadata.timeRange).toBe(DashboardTimeRange.THIS_MONTH);
      expect(result.metadata.filters.organizationId).toBe(mockOrganizationId);
    });

    it('should handle custom date range', async () => {
      const startDate = startOfMonth(new Date());
      const endDate = endOfMonth(new Date());

      // Setup minimal mocks to avoid errors
      mockPrisma.asset.count.mockResolvedValue(0);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: null },
      } as any);
      mockPrisma.activityStream.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.CUSTOM,
        startDate,
        endDate,
      };

      const result = await dashboardService.getOverviewDashboard(mockContext, request);

      expect(result.metadata.startDate).toEqual(startDate);
      expect(result.metadata.endDate).toEqual(endDate);
    });

    it('should throw validation error for custom range without dates', async () => {
      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.CUSTOM,
      };

      await expect(dashboardService.getOverviewDashboard(mockContext, request)).rejects.toThrow(
        'Start date and end date are required for custom time range',
      );
    });
  });

  describe('getAssetDashboard', () => {
    it('should return asset dashboard data with statistics', async () => {
      // Mock category stats
      (mockPrisma.asset.groupBy as jest.Mock).mockResolvedValueOnce([
        { category: AssetCategory.EQUIPMENT, _count: 50 },
        { category: AssetCategory.HARDWARE, _count: 30 },
      ]);

      // Mock status stats
      (mockPrisma.asset.groupBy as jest.Mock).mockResolvedValueOnce([
        { status: AssetStatus.OPERATIONAL, _count: 70 },
        { status: AssetStatus.MAINTENANCE, _count: 10 },
      ]);

      // Mock location stats
      (mockPrisma.asset.groupBy as jest.Mock).mockResolvedValueOnce([
        {
          locationId: 'loc-1',
          _count: 40,
          _sum: { purchasePrice: { toNumber: () => 200000 } },
        },
      ]);

      // Mock age analysis
      mockPrisma.asset.findMany.mockResolvedValueOnce([
        { 
          id: 'asset-1',
          purchaseDate: subDays(new Date(), 365),
          organizationId: mockOrganizationId,
          name: 'Asset 1',
          category: AssetCategory.EQUIPMENT,
          description: null,
          customFields: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          link: null,
          status: AssetStatus.OPERATIONAL,
          locationId: null,
          assetTemplateId: null,
          parentId: null,
          manufacturer: null,
          modelNumber: null,
          serialNumber: null,
          purchasePrice: null,
          warrantyExpiry: null,
          warrantyLifetime: false,
          warrantyScope: null,
          secondaryWarrantyExpiry: null,
          secondaryWarrantyScope: null,
          qrCode: null,
          path: '/asset-1',
          tags: [],
        },
        { 
          id: 'asset-2',
          purchaseDate: subDays(new Date(), 1095),
          organizationId: mockOrganizationId,
          name: 'Asset 2',
          category: AssetCategory.EQUIPMENT,
          description: null,
          customFields: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          link: null,
          status: AssetStatus.OPERATIONAL,
          locationId: null,
          assetTemplateId: null,
          parentId: null,
          manufacturer: null,
          modelNumber: null,
          serialNumber: null,
          purchasePrice: null,
          warrantyExpiry: null,
          warrantyLifetime: false,
          warrantyScope: null,
          secondaryWarrantyExpiry: null,
          secondaryWarrantyScope: null,
          qrCode: null,
          path: '/asset-2',
          tags: [],
        },
        { 
          id: 'asset-3',
          purchaseDate: null,
          organizationId: mockOrganizationId,
          name: 'Asset 3',
          category: AssetCategory.EQUIPMENT,
          description: null,
          customFields: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          link: null,
          status: AssetStatus.OPERATIONAL,
          locationId: null,
          assetTemplateId: null,
          parentId: null,
          manufacturer: null,
          modelNumber: null,
          serialNumber: null,
          purchasePrice: null,
          warrantyExpiry: null,
          warrantyLifetime: false,
          warrantyScope: null,
          secondaryWarrantyExpiry: null,
          secondaryWarrantyScope: null,
          qrCode: null,
          path: '/asset-3',
          tags: [],
        },
      ] as any);

      // Mock locations for mapping
      mockPrisma.location.findMany.mockResolvedValueOnce([{
        id: 'loc-1',
        name: 'Main Office',
        organizationId: mockOrganizationId,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        parentId: null,
        path: '/loc-1',
      }] as any);

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.THIS_MONTH,
      };

      const result = await dashboardService.getAssetDashboard(mockContext, request);

      expect(result.data.assetStatistics.byCategory).toHaveProperty(AssetCategory.EQUIPMENT, 50);
      expect(result.data.assetStatistics.byCategory).toHaveProperty(
        AssetCategory.HARDWARE,
        30,
      );
      expect(result.data.assetStatistics.byStatus).toHaveProperty(AssetStatus.OPERATIONAL, 70);
      expect(result.data.assetStatistics.byStatus).toHaveProperty(AssetStatus.MAINTENANCE, 10);

      expect(result.data.assetStatistics.byLocation).toHaveLength(1);
      expect(result.data.assetStatistics.byLocation[0]).toEqual({
        locationId: 'loc-1',
        locationName: 'Main Office',
        count: 40,
        value: 200000,
      });

      expect(result.data.assetStatistics.byAge.oneToThreeYears).toBe(1);
      expect(result.data.assetStatistics.byAge.threeToFiveYears).toBe(1);
      expect(result.data.assetStatistics.byAge.unknown).toBe(1);
    });
  });

  describe('getCalendarDashboard', () => {
    it('should return calendar dashboard data with task density', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          organizationId: mockOrganizationId,
          title: 'Task 1',
          description: 'Task description',
          dueDate: new Date(),
          status: TaskStatus.PLANNED,
          priority: TaskPriority.HIGH,
          assetId: 'asset-1',
          scheduleId: null,
          parentTaskId: null,
          subtaskOrder: 0,
          estimatedCost: null,
          actualCost: null,
          estimatedMinutes: 60,
          actualMinutes: null,
          completedAt: null,
          skippedAt: null,
          completionRequirements: null,
          isPhotoRequired: false,
          checklistItems: null,
          googleEventId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          assignments: [{ user: { id: 'user-1', fullName: 'John Doe' } }],
          asset: { id: 'asset-1', name: 'Asset 1' },
          schedule: null,
        },
      ];

      mockPrisma.task.findMany.mockResolvedValueOnce(mockTasks as any);

      mockPrisma.schedule.count.mockResolvedValueOnce(5); // activeSchedules
      mockPrisma.task.count.mockResolvedValueOnce(20); // recurringTasks

      // Mock upcoming deadlines
      mockPrisma.task.findMany.mockResolvedValueOnce([
        {
          id: 'task-urgent',
          organizationId: mockOrganizationId,
          title: 'Urgent Task',
          description: 'Urgent task description',
          dueDate: subDays(new Date(), -1),
          priority: TaskPriority.HIGH,
          status: TaskStatus.PLANNED,
          assetId: null,
          scheduleId: null,
          parentTaskId: null,
          subtaskOrder: 0,
          estimatedCost: null,
          actualCost: null,
          estimatedMinutes: 30,
          actualMinutes: null,
          completedAt: null,
          skippedAt: null,
          completionRequirements: null,
          isPhotoRequired: false,
          checklistItems: null,
          googleEventId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          assignments: [{ user: { fullName: 'Jane Smith' } }],
        },
      ] as any);

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.THIS_WEEK,
      };

      const result = await dashboardService.getCalendarDashboard(mockContext, request);

      expect(result.data.scheduleData.activeSchedules).toBe(5);
      expect(result.data.scheduleData.recurringTasks).toBe(20);
      expect(result.data.upcomingDeadlines).toHaveLength(1);
      expect(result.data.taskDensity.daily).toBeDefined();
      expect(result.data.taskDensity.weekly).toBeDefined();
      expect(result.data.taskDensity.monthly).toBeDefined();
    });
  });

  describe('getTaskDashboard', () => {
    it('should return task dashboard data with metrics', async () => {
      // Mock status stats
      (mockPrisma.task.groupBy as jest.Mock).mockResolvedValueOnce([
        { status: TaskStatus.DONE, _count: 100 },
        { status: TaskStatus.IN_PROGRESS, _count: 50 },
        { status: TaskStatus.PLANNED, _count: 30 },
      ]);

      // Mock priority stats
      (mockPrisma.task.groupBy as jest.Mock).mockResolvedValueOnce([
        { priority: TaskPriority.HIGH, _count: 60 },
        { priority: TaskPriority.MEDIUM, _count: 80 },
        { priority: TaskPriority.LOW, _count: 40 },
      ]);

      // Mock task counts for performance analysis
      mockPrisma.task.count
        .mockResolvedValueOnce(180) // tasksCreated
        .mockResolvedValueOnce(100) // tasksCompleted
        .mockResolvedValueOnce(20) // tasksOverdue
        .mockResolvedValueOnce(5); // tasksCancelled

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.THIS_MONTH,
      };

      const result = await dashboardService.getTaskDashboard(mockContext, request);

      expect(result.data.taskMetrics.byStatus).toHaveProperty(TaskStatus.DONE, 100);
      expect(result.data.taskMetrics.byStatus).toHaveProperty(TaskStatus.IN_PROGRESS, 50);
      expect(result.data.taskMetrics.byPriority).toHaveProperty(TaskPriority.HIGH, 60);
      expect(result.data.taskMetrics.byPriority).toHaveProperty(TaskPriority.MEDIUM, 80);

      expect(result.data.performanceAnalysis.tasksCreated).toBe(180);
      expect(result.data.performanceAnalysis.tasksCompleted).toBe(100);
      expect(result.data.performanceAnalysis.tasksOverdue).toBe(20);
      expect(result.data.performanceAnalysis.tasksCancelled).toBe(5);
    });
  });

  describe('date range calculation', () => {
    it('should calculate TODAY range correctly', () => {
      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.TODAY,
      };

      // Setup minimal mocks
      mockPrisma.asset.count.mockResolvedValue(0);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: null },
      } as any);
      mockPrisma.activityStream.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]);

      return expect(dashboardService.getOverviewDashboard(mockContext, request)).resolves.toBeDefined();
    });

    it('should calculate THIS_WEEK range correctly', () => {
      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.THIS_WEEK,
      };

      // Setup minimal mocks
      mockPrisma.asset.count.mockResolvedValue(0);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: null },
      } as any);
      mockPrisma.activityStream.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]);

      return expect(dashboardService.getOverviewDashboard(mockContext, request)).resolves.toBeDefined();
    });

    it('should calculate LAST_30_DAYS range correctly', () => {
      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.LAST_30_DAYS,
      };

      // Setup minimal mocks
      mockPrisma.asset.count.mockResolvedValue(0);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: null },
      } as any);
      mockPrisma.activityStream.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]);

      return expect(dashboardService.getOverviewDashboard(mockContext, request)).resolves.toBeDefined();
    });

    it('should throw error for invalid time range', async () => {
      const request = {
        organizationId: mockOrganizationId,
        timeRange: 'INVALID_RANGE' as any,
      };

      await expect(dashboardService.getOverviewDashboard(mockContext, request)).rejects.toThrow(
        'Invalid time range specified',
      );
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.asset.count.mockRejectedValueOnce(new Error('Database connection failed'));

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.TODAY,
      };

      await expect(dashboardService.getOverviewDashboard(mockContext, request)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle null/undefined values in aggregations', async () => {
      mockPrisma.asset.count.mockResolvedValue(0);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: null },
      } as any);
      mockPrisma.activityStream.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.TODAY,
      };

      const result = await dashboardService.getOverviewDashboard(mockContext, request);
      expect(result.data.summaryCards.totalValue).toBe(0);
    });
  });

  describe('filtering', () => {
    it('should apply location filter when provided', async () => {
      const locationId = 'loc-123';

      // Setup minimal mocks
      mockPrisma.asset.count.mockResolvedValue(0);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: null },
      } as any);
      mockPrisma.activityStream.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.TODAY,
        locationId,
      };

      const result = await dashboardService.getOverviewDashboard(mockContext, request);

      // Verify that the asset.count calls include locationId filter
      const assetCountCalls = mockPrisma.asset.count.mock.calls;
      assetCountCalls.forEach((call) => {
        if (call[0]?.where) {
          expect(call[0].where).toMatchObject({
            organizationId: mockOrganizationId,
            locationId,
          });
        }
      });

      expect(result.metadata.filters.locationId).toBe(locationId);
    });

    it('should apply user filter when provided', async () => {
      const userId = 'user-123';

      // Setup minimal mocks
      mockPrisma.asset.count.mockResolvedValue(0);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _min: {},
        _max: {},
        _avg: {},
        _sum: { purchasePrice: null },
      } as any);
      mockPrisma.activityStream.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const request = {
        organizationId: mockOrganizationId,
        timeRange: DashboardTimeRange.TODAY,
        userId,
      };

      const result = await dashboardService.getOverviewDashboard(mockContext, request);
      expect(result.metadata.filters.userId).toBe(userId);
    });
  });
});
