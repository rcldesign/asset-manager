import { ReportingService } from '../../../services/reporting.service';
import { prisma } from '../../../lib/prisma';
import { ReportFormat } from '../../../types/reports';
import { AssetCategory, AssetStatus, TaskStatus, TaskPriority } from '@prisma/client';
import { subDays, subYears } from 'date-fns';

// Mock Prisma
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn()
    },
    task: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn()
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    location: {
      findMany: jest.fn()
    },
    taskAssignment: {
      findMany: jest.fn()
    },
    auditTrail: {
      create: jest.fn()
    }
  }
}));

// Mock AuditService
jest.mock('../../../services/audit.service', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    log: jest.fn()
  }))
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('ReportingService', () => {
  let reportingService: ReportingService;
  const mockOrganizationId = 'org-123';

  beforeEach(() => {
    reportingService = new ReportingService();
    jest.clearAllMocks();
  });

  describe('generateAssetAgeAnalysis', () => {
    it('should generate asset age analysis report with correct calculations', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          name: 'Old Server',
          category: AssetCategory.EQUIPMENT,
          purchaseDate: subYears(new Date(), 5),
          purchasePrice: { toNumber: () => 10000 }
        },
        {
          id: 'asset-2',
          name: 'New Laptop',
          category: AssetCategory.EQUIPMENT,
          purchaseDate: subDays(new Date(), 180),
          purchasePrice: { toNumber: () => 1500 }
        },
        {
          id: 'asset-3',
          name: 'Unknown Age Asset',
          category: AssetCategory.INFRASTRUCTURE,
          purchaseDate: null,
          purchasePrice: { toNumber: () => 5000 }
        }
      ];

      mockPrisma.asset.findMany.mockResolvedValueOnce(mockAssets);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      const result = await reportingService.generateAssetAgeAnalysis(request);

      expect(result.summary.totalAssets).toBe(3);
      expect(result.summary.avgAge).toBeGreaterThan(0);
      expect(result.summary.oldestAsset).toEqual({
        id: 'asset-1',
        name: 'Old Server',
        purchaseDate: mockAssets[0].purchaseDate,
        ageInYears: 5
      });
      expect(result.summary.newestAsset).toEqual({
        id: 'asset-2',
        name: 'New Laptop',
        purchaseDate: mockAssets[1].purchaseDate,
        ageInYears: 0
      });

      expect(result.ageDistribution).toHaveLength(5);
      expect(result.ageDistribution.find(d => d.range === '0-1 years')).toMatchObject({
        count: 1,
        percentage: expect.any(Number)
      });

      expect(result.byCategory).toHaveLength(2);
      expect(result.byCategory.find(c => c.category === AssetCategory.EQUIPMENT)).toMatchObject({
        count: 2,
        avgAge: expect.any(Number)
      });

      expect(result.depreciation.originalValue).toBe(16500);
      expect(result.depreciation.currentValue).toBeGreaterThan(0);
      expect(result.depreciation.avgDepreciationRate).toBe(20);
    });

    it('should handle assets without purchase dates', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          name: 'Asset Without Date',
          category: AssetCategory.EQUIPMENT,
          purchaseDate: null,
          purchasePrice: { toNumber: () => 1000 }
        }
      ];

      mockPrisma.asset.findMany.mockResolvedValueOnce(mockAssets);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      const result = await reportingService.generateAssetAgeAnalysis(request);

      expect(result.summary.totalAssets).toBe(1);
      expect(result.summary.avgAge).toBe(0);
      expect(result.summary.oldestAsset).toBeNull();
      expect(result.summary.newestAsset).toBeNull();
    });
  });

  describe('generateAssetWarrantyReport', () => {
    it('should generate warranty report with correct warranty status', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          name: 'Under Warranty',
          category: AssetCategory.EQUIPMENT,
          warrantyLifetime: false,
          warrantyExpiry: subDays(new Date(), -30), // Expires in 30 days
          secondaryWarrantyExpiry: null,
          warrantyScope: 'Full coverage',
          location: { id: 'loc-1', name: 'Office A' }
        },
        {
          id: 'asset-2',
          name: 'Lifetime Warranty',
          category: AssetCategory.EQUIPMENT,
          warrantyLifetime: true,
          warrantyExpiry: null,
          secondaryWarrantyExpiry: null,
          warrantyScope: null,
          location: { id: 'loc-1', name: 'Office A' }
        },
        {
          id: 'asset-3',
          name: 'Expired Warranty',
          category: AssetCategory.INFRASTRUCTURE,
          warrantyLifetime: false,
          warrantyExpiry: subDays(new Date(), 30), // Expired 30 days ago
          secondaryWarrantyExpiry: null,
          warrantyScope: 'Limited',
          location: { id: 'loc-2', name: 'Office B' }
        },
        {
          id: 'asset-4',
          name: 'No Warranty',
          category: AssetCategory.EQUIPMENT,
          warrantyLifetime: false,
          warrantyExpiry: null,
          secondaryWarrantyExpiry: null,
          warrantyScope: null,
          location: null
        }
      ];

      mockPrisma.asset.findMany.mockResolvedValueOnce(mockAssets);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      const result = await reportingService.generateAssetWarrantyReport(request);

      expect(result.summary.totalAssets).toBe(4);
      expect(result.summary.underWarranty).toBe(1);
      expect(result.summary.lifetimeWarranty).toBe(1);
      expect(result.summary.expiredWarranty).toBe(1);
      expect(result.summary.noWarranty).toBe(1);

      expect(result.expiringWarranties).toHaveLength(1);
      expect(result.expiringWarranties[0]).toMatchObject({
        assetId: 'asset-1',
        assetName: 'Under Warranty',
        category: AssetCategory.EQUIPMENT,
        location: 'Office A',
        warrantyType: 'primary',
        daysUntilExpiry: 30
      });

      expect(result.warrantyByCategory).toHaveLength(2);
      expect(result.warrantyByVendor).toBeDefined();
    });
  });

  describe('generateAssetMaintenanceReport', () => {
    it('should generate maintenance report with task statistics', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Scheduled Maintenance',
          status: TaskStatus.PLANNED,
          dueDate: subDays(new Date(), -7),
          createdAt: subDays(new Date(), 10),
          completedAt: null,
          estimatedCost: { toNumber: () => 500 },
          actualCost: null,
          assetId: 'asset-1',
          asset: { id: 'asset-1', name: 'Server A', category: AssetCategory.EQUIPMENT }
        },
        {
          id: 'task-2',
          title: 'Completed Maintenance',
          status: TaskStatus.COMPLETED,
          dueDate: subDays(new Date(), 5),
          createdAt: subDays(new Date(), 15),
          completedAt: subDays(new Date(), 3),
          estimatedCost: { toNumber: () => 300 },
          actualCost: { toNumber: () => 350 },
          assetId: 'asset-1',
          asset: { id: 'asset-1', name: 'Server A', category: AssetCategory.EQUIPMENT }
        },
        {
          id: 'task-3',
          title: 'Overdue Maintenance',
          status: TaskStatus.IN_PROGRESS,
          dueDate: subDays(new Date(), 2), // Overdue
          createdAt: subDays(new Date(), 20),
          completedAt: null,
          estimatedCost: { toNumber: () => 400 },
          actualCost: null,
          assetId: 'asset-2',
          asset: { id: 'asset-2', name: 'Printer B', category: AssetCategory.EQUIPMENT }
        }
      ];

      mockPrisma.task.findMany.mockResolvedValueOnce(mockTasks);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON,
        startDate: subDays(new Date(), 30),
        endDate: new Date()
      };

      const result = await reportingService.generateAssetMaintenanceReport(request);

      expect(result.summary.totalMaintenanceTasks).toBe(3);
      expect(result.summary.completedTasks).toBe(1);
      expect(result.summary.scheduledTasks).toBe(1);
      expect(result.summary.overdueTasks).toBe(1);
      expect(result.summary.totalCost).toBe(350);

      expect(result.maintenanceByAsset).toHaveLength(2);
      expect(result.maintenanceByAsset[0]).toMatchObject({
        assetId: 'asset-1',
        assetName: 'Server A',
        category: AssetCategory.EQUIPMENT,
        taskCount: 2,
        totalCost: 350
      });

      expect(result.maintenanceByCategory).toHaveLength(1);
      expect(result.maintenanceByCategory[0]).toMatchObject({
        category: AssetCategory.EQUIPMENT,
        taskCount: 3,
        totalCost: 350
      });

      expect(result.costAnalysis.estimatedVsActual.totalEstimated).toBe(1200);
      expect(result.costAnalysis.estimatedVsActual.totalActual).toBe(350);
    });
  });

  describe('generateTaskCompletionReport', () => {
    it('should generate task completion report with metrics', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.HIGH,
          createdAt: subDays(new Date(), 10),
          completedAt: subDays(new Date(), 5),
          dueDate: subDays(new Date(), 3)
        },
        {
          id: 'task-2',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          createdAt: subDays(new Date(), 15),
          completedAt: subDays(new Date(), 12),
          dueDate: subDays(new Date(), 10)
        },
        {
          id: 'task-3',
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.LOW,
          createdAt: subDays(new Date(), 8),
          completedAt: null,
          dueDate: subDays(new Date(), 2)
        }
      ];

      mockPrisma.task.findMany.mockResolvedValueOnce(mockTasks);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON,
        startDate: subDays(new Date(), 30),
        endDate: new Date()
      };

      const result = await reportingService.generateTaskCompletionReport(request);

      expect(result.summary.totalTasks).toBe(3);
      expect(result.summary.completedTasks).toBe(2);
      expect(result.summary.completionRate).toBe(67); // 2/3 * 100, rounded

      expect(result.byStatus).toHaveLength(Object.keys(TaskStatus).length);
      expect(result.byStatus.find(s => s.status === TaskStatus.COMPLETED)).toMatchObject({
        count: 2,
        percentage: expect.any(Number)
      });

      expect(result.byPriority).toHaveLength(Object.keys(TaskPriority).length);
      expect(result.byPriority.find(p => p.priority === TaskPriority.HIGH)).toMatchObject({
        totalTasks: 1,
        completed: 1,
        completionRate: 100
      });

      expect(result.delayAnalysis.totalDelayed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateTaskCostReport', () => {
    it('should generate cost report with variance analysis', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedCost: { toNumber: () => 1000 },
          actualCost: { toNumber: () => 1200 },
          asset: { category: AssetCategory.EQUIPMENT },
          assignments: [{ user: { fullName: 'John Doe' } }]
        },
        {
          id: 'task-2',
          title: 'Task 2',
          estimatedCost: { toNumber: () => 500 },
          actualCost: { toNumber: () => 450 },
          asset: { category: AssetCategory.EQUIPMENT },
          assignments: [{ user: { fullName: 'Jane Smith' } }]
        },
        {
          id: 'task-3',
          title: 'Task 3',
          estimatedCost: { toNumber: () => 800 },
          actualCost: { toNumber: () => 1000 },
          asset: null,
          assignments: []
        }
      ];

      mockPrisma.task.findMany.mockResolvedValueOnce(mockTasks);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      const result = await reportingService.generateTaskCostReport(request);

      expect(result.summary.totalEstimatedCost).toBe(2300);
      expect(result.summary.totalActualCost).toBe(2650);
      expect(result.summary.variance).toBe(350);
      expect(result.summary.variancePercentage).toBe(15); // 350/2300 * 100, rounded

      expect(result.byCategory).toHaveLength(2); // EQUIPMENT and Other
      expect(result.byCategory.find(c => c.category === 'EQUIPMENT')).toMatchObject({
        taskCount: 2,
        estimatedCost: 1500,
        actualCost: 1650,
        variance: 150
      });

      expect(result.overBudgetTasks).toHaveLength(2);
      expect(result.overBudgetTasks[0]).toMatchObject({
        taskId: 'task-3',
        title: 'Task 3',
        estimatedCost: 800,
        actualCost: 1000,
        overageAmount: 200,
        overagePercentage: 25
      });
    });
  });

  describe('generateUserWorkloadReport', () => {
    it('should generate user workload report with performance metrics', async () => {
      const mockUsers = [
        { id: 'user-1', fullName: 'John Doe', email: 'john@example.com', isActive: true },
        { id: 'user-2', fullName: 'Jane Smith', email: 'jane@example.com', isActive: true }
      ];

      const mockAssignments = [
        {
          userId: 'user-1',
          user: { id: 'user-1', fullName: 'John Doe', email: 'john@example.com' },
          task: {
            id: 'task-1',
            status: TaskStatus.COMPLETED,
            dueDate: subDays(new Date(), 5),
            estimatedMinutes: 120,
            actualMinutes: 100,
            createdAt: subDays(new Date(), 10),
            completedAt: subDays(new Date(), 5)
          }
        },
        {
          userId: 'user-1',
          user: { id: 'user-1', fullName: 'John Doe', email: 'john@example.com' },
          task: {
            id: 'task-2',
            status: TaskStatus.IN_PROGRESS,
            dueDate: subDays(new Date(), -5),
            estimatedMinutes: 180,
            actualMinutes: null,
            createdAt: subDays(new Date(), 8),
            completedAt: null
          }
        },
        {
          userId: 'user-2',
          user: { id: 'user-2', fullName: 'Jane Smith', email: 'jane@example.com' },
          task: {
            id: 'task-3',
            status: TaskStatus.COMPLETED,
            dueDate: subDays(new Date(), 3),
            estimatedMinutes: 90,
            actualMinutes: 85,
            createdAt: subDays(new Date(), 7),
            completedAt: subDays(new Date(), 2)
          }
        }
      ];

      mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);
      mockPrisma.taskAssignment.findMany.mockResolvedValueOnce(mockAssignments);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      const result = await reportingService.generateUserWorkloadReport(request);

      expect(result.summary.totalUsers).toBe(2);
      expect(result.summary.activeUsers).toBe(2);
      expect(result.summary.totalTasks).toBe(3);

      expect(result.userMetrics).toHaveLength(2);
      expect(result.userMetrics.find(u => u.userId === 'user-1')).toMatchObject({
        userName: 'John Doe',
        assignedTasks: 2,
        completedTasks: 1,
        inProgressTasks: 1,
        overdueTasks: 0,
        totalEstimatedHours: 5, // (120 + 180) / 60
        totalActualHours: 2 // 100 / 60, rounded
      });

      expect(result.workloadDistribution.balanced).toBeDefined();
      expect(result.teamPerformance.topPerformers).toBeDefined();
      expect(result.teamPerformance.needsAttention).toBeDefined();
    });
  });

  describe('generateUserPerformanceReport', () => {
    it('should generate individual user performance report', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        fullName: 'John Doe',
        email: 'john@example.com'
      };

      const mockAssignments = [
        {
          userId,
          task: {
            id: 'task-1',
            status: TaskStatus.COMPLETED,
            dueDate: subDays(new Date(), 5),
            estimatedMinutes: 120,
            actualMinutes: 100,
            createdAt: subDays(new Date(), 10),
            completedAt: subDays(new Date(), 4) // Completed on time
          }
        },
        {
          userId,
          task: {
            id: 'task-2',
            status: TaskStatus.COMPLETED,
            dueDate: subDays(new Date(), 10),
            estimatedMinutes: 180,
            actualMinutes: 200,
            createdAt: subDays(new Date(), 15),
            completedAt: subDays(new Date(), 8) // Completed late
          }
        }
      ];

      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.taskAssignment.findMany.mockResolvedValueOnce(mockAssignments);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON,
        startDate: subDays(new Date(), 30),
        endDate: new Date()
      };

      const result = await reportingService.generateUserPerformanceReport(userId, request);

      expect(result.userId).toBe(userId);
      expect(result.userName).toBe('John Doe');

      expect(result.taskMetrics.assigned).toBe(2);
      expect(result.taskMetrics.completed).toBe(2);
      expect(result.taskMetrics.completionRate).toBe(100);
      expect(result.taskMetrics.onTimeRate).toBe(50); // 1 out of 2 on time

      expect(result.timeMetrics.totalEstimatedHours).toBe(5); // (120 + 180) / 60
      expect(result.timeMetrics.totalActualHours).toBe(5); // (100 + 200) / 60
      expect(result.timeMetrics.efficiency).toBe(100); // actual = estimated

      expect(result.trendAnalysis).toBeDefined();
    });

    it('should throw error if user not found', async () => {
      const userId = 'nonexistent-user';
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON,
        startDate: subDays(new Date(), 30),
        endDate: new Date()
      };

      await expect(reportingService.generateUserPerformanceReport(userId, request))
        .rejects.toThrow('User');
    });
  });

  describe('export functionality', () => {
    it('should export report as JSON', async () => {
      const reportData = { test: 'data', summary: { total: 100 } };
      
      const result = await reportingService.exportReport(
        reportData,
        ReportFormat.JSON,
        'test-report'
      );

      expect(result).toBe(JSON.stringify(reportData, null, 2));
    });

    it('should export report as CSV', async () => {
      const reportData = [
        { name: 'Asset 1', category: 'Equipment', value: 1000 },
        { name: 'Asset 2', category: 'Infrastructure', value: 2000 }
      ];
      
      const result = await reportingService.exportReport(
        reportData,
        ReportFormat.CSV,
        'asset-report'
      );

      expect(typeof result).toBe('string');
      expect(result).toContain('name,category,value');
      expect(result).toContain('Asset 1,Equipment,1000');
    });

    it('should throw error for unsupported format', async () => {
      const reportData = { test: 'data' };
      
      await expect(reportingService.exportReport(
        reportData,
        'UNSUPPORTED' as any,
        'test-report'
      )).rejects.toThrow('Unsupported format');
    });
  });

  describe('error handling', () => {
    it('should handle database errors in report generation', async () => {
      mockPrisma.asset.findMany.mockRejectedValueOnce(new Error('Database error'));

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      await expect(reportingService.generateAssetAgeAnalysis(request))
        .rejects.toThrow('Database error');
    });

    it('should handle empty data sets gracefully', async () => {
      mockPrisma.asset.findMany.mockResolvedValueOnce([]);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      const result = await reportingService.generateAssetAgeAnalysis(request);

      expect(result.summary.totalAssets).toBe(0);
      expect(result.summary.avgAge).toBe(0);
      expect(result.summary.oldestAsset).toBeNull();
      expect(result.summary.newestAsset).toBeNull();
    });
  });

  describe('date filtering', () => {
    it('should apply date filters correctly', async () => {
      const startDate = subDays(new Date(), 30);
      const endDate = new Date();

      mockPrisma.task.findMany.mockResolvedValueOnce([]);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON,
        startDate,
        endDate
      };

      await reportingService.generateTaskCompletionReport(request);

      // Verify that the task query includes the date filter
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
            createdAt: { gte: startDate, lte: endDate }
          })
        })
      );
    });

    it('should work without date filters', async () => {
      mockPrisma.task.findMany.mockResolvedValueOnce([]);

      const request = {
        organizationId: mockOrganizationId,
        format: ReportFormat.JSON
      };

      await reportingService.generateTaskCompletionReport(request);

      // Verify that the query doesn't include date filter when not provided
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId
          })
        })
      );
    });
  });
});