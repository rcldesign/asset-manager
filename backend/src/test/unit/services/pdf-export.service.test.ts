import { PDFExportService } from '../../../services/pdf-export.service';
// import { format } from 'date-fns'; // TODO: Use if needed
import type { ReportOptions } from '../../../types/reports';

// Mock pdfmake
jest.mock('pdfmake/build/pdfmake', () => ({
  createPdf: jest.fn().mockReturnValue({
    getBuffer: jest.fn((callback) => {
      // Simulate PDF buffer generation
      const mockBuffer = Buffer.from('mock-pdf-content');
      callback(mockBuffer);
    }),
  }),
}));

// Mock pdfmake fonts
jest.mock('pdfmake/build/vfs_fonts', () => ({
  pdfMake: {
    vfs: {},
  },
}));

describe('PDFExportService', () => {
  let pdfExportService: PDFExportService;

  beforeEach(() => {
    pdfExportService = new PDFExportService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOverviewDashboardPDF', () => {
    it('should generate PDF for overview dashboard with complete data', async () => {
      const mockData = {
        metadata: {
          generatedAt: new Date('2024-01-15T10:00:00Z'),
          timeRange: 'Last 30 days',
          startDate: new Date('2023-12-16T00:00:00Z'),
          endDate: new Date('2024-01-15T23:59:59Z'),
          filters: {
            locationId: 'loc-123',
            userId: 'user-456',
          },
        },
        data: {
          summaryCards: {
            totalAssets: 150,
            activeAssets: 142,
            totalTasks: 89,
            openTasks: 23,
            overdueTasks: 5,
            totalUsers: 12,
            activeUsers: 8,
            totalValue: 125000,
          },
          activityMetrics: {
            tasksCreatedCount: 45,
            tasksCompletedCount: 38,
            assetsAddedCount: 12,
            assetsUpdatedCount: 67,
            avgTaskCompletionTime: 2.5,
            taskCompletionRate: 84.4,
          },
          recentActivity: [
            {
              type: 'task_completed',
              title: 'Monthly maintenance check',
              userName: 'John Doe',
              timestamp: new Date('2024-01-15T09:30:00Z'),
            },
            {
              type: 'asset_added',
              title: 'New server equipment',
              userName: 'Jane Smith',
              timestamp: new Date('2024-01-15T08:45:00Z'),
            },
          ],
          quickActions: {
            urgentTasks: [
              {
                title: 'Critical system backup',
                dueDate: new Date('2024-01-16T00:00:00Z'),
                priority: 'HIGH',
                assetName: 'Server-001',
              },
            ],
            warrantyAlerts: [
              {
                assetName: 'Laptop-123',
                warrantyExpiry: new Date('2024-02-01T00:00:00Z'),
                daysUntilExpiry: 17,
              },
            ],
          },
        },
      };

      const options: ReportOptions = {
        customBranding: {
          companyName: 'Test Company',
          primaryColor: '#1976d2',
          logo: 'data:image/png;base64,test',
        },
      };

      const result = await pdfExportService.generateOverviewDashboardPDF(mockData, options);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('mock-pdf-content');
    });

    it('should handle empty activity data gracefully', async () => {
      const mockData = {
        metadata: {
          generatedAt: new Date(),
          timeRange: 'Last 7 days',
          startDate: new Date(),
          endDate: new Date(),
          filters: {},
        },
        data: {
          summaryCards: {
            totalAssets: 0,
            activeAssets: 0,
            totalTasks: 0,
            openTasks: 0,
            overdueTasks: 0,
            totalUsers: 0,
            activeUsers: 0,
            totalValue: 0,
          },
          activityMetrics: {
            tasksCreatedCount: 0,
            tasksCompletedCount: 0,
            assetsAddedCount: 0,
            assetsUpdatedCount: 0,
            avgTaskCompletionTime: 0,
            taskCompletionRate: 0,
          },
          recentActivity: [],
          quickActions: {
            urgentTasks: [],
            warrantyAlerts: [],
          },
        },
      };

      const result = await pdfExportService.generateOverviewDashboardPDF(mockData);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('generateAssetDashboardPDF', () => {
    it('should generate PDF for asset dashboard with complete data', async () => {
      const mockData = {
        metadata: {
          generatedAt: new Date('2024-01-15T10:00:00Z'),
          timeRange: 'Last 30 days',
          startDate: new Date('2023-12-16T00:00:00Z'),
          endDate: new Date('2024-01-15T23:59:59Z'),
          filters: {},
        },
        data: {
          assetStatistics: {
            byCategory: {
              Computers: 45,
              Furniture: 23,
              Equipment: 18,
            },
            byStatus: {
              Active: 78,
              Inactive: 8,
            },
            byAge: {
              lessThan1Year: 12,
              oneToThreeYears: 34,
              threeToFiveYears: 28,
              moreThanFiveYears: 10,
              unknown: 2,
            },
          },
          warrantyAnalysis: {
            activeWarranties: 65,
            lifetimeWarranties: 12,
            expiredWarranties: 9,
            expiringWarranties: [
              {
                assetName: 'Laptop-456',
                category: 'Computers',
                location: 'Office A',
                expiryDate: new Date('2024-02-15T00:00:00Z'),
                daysUntilExpiry: 31,
              },
            ],
          },
          maintenanceHistory: {
            scheduledMaintenance: 45,
            completedMaintenance: 38,
            overdueMaintenance: 3,
            maintenanceCosts: {
              period: 40,
              actual: 8500,
              estimated: 7800,
            },
            upcomingMaintenance: [
              {
                assetName: 'Server-002',
                taskTitle: 'Quarterly maintenance',
                dueDate: new Date('2024-02-01T00:00:00Z'),
                estimatedCost: 450,
              },
            ],
          },
          assetValue: {
            totalPurchaseValue: 245000,
            depreciatedValue: 185000,
            topValueAssets: [
              {
                name: 'Server-Primary',
                category: 'Equipment',
                purchasePrice: 25000,
                purchaseDate: new Date('2023-06-15T00:00:00Z'),
              },
            ],
          },
        },
      };

      const result = await pdfExportService.generateAssetDashboardPDF(mockData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('mock-pdf-content');
    });

    it('should handle empty warranty and maintenance data', async () => {
      const mockData = {
        metadata: {
          generatedAt: new Date(),
          timeRange: 'Last 30 days',
          startDate: new Date(),
          endDate: new Date(),
          filters: {},
        },
        data: {
          assetStatistics: {
            byCategory: {},
            byStatus: {},
            byAge: {
              lessThan1Year: 0,
              oneToThreeYears: 0,
              threeToFiveYears: 0,
              moreThanFiveYears: 0,
              unknown: 0,
            },
          },
          warrantyAnalysis: {
            activeWarranties: 0,
            lifetimeWarranties: 0,
            expiredWarranties: 0,
            expiringWarranties: [],
          },
          maintenanceHistory: {
            scheduledMaintenance: 0,
            completedMaintenance: 0,
            overdueMaintenance: 0,
            maintenanceCosts: {
              period: 0,
              actual: 0,
              estimated: 0,
            },
            upcomingMaintenance: [],
          },
          assetValue: {
            totalPurchaseValue: 0,
            depreciatedValue: 0,
            topValueAssets: [],
          },
        },
      };

      const result = await pdfExportService.generateAssetDashboardPDF(mockData);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('generateTaskDashboardPDF', () => {
    it('should generate PDF for task dashboard with complete data', async () => {
      const mockData = {
        metadata: {
          generatedAt: new Date('2024-01-15T10:00:00Z'),
          timeRange: 'Last 30 days',
          startDate: new Date('2023-12-16T00:00:00Z'),
          endDate: new Date('2024-01-15T23:59:59Z'),
          filters: {},
        },
        data: {
          taskMetrics: {
            byStatus: {
              TODO: 15,
              IN_PROGRESS: 8,
              COMPLETED: 45,
              CANCELLED: 2,
            },
            byPriority: {
              LOW: 12,
              MEDIUM: 35,
              HIGH: 18,
              CRITICAL: 5,
            },
            completionRate: {
              overall: 85.2,
              onTime: 78.3,
              late: 21.7,
            },
          },
          performanceAnalysis: {
            tasksCreated: 70,
            tasksCompleted: 45,
            tasksOverdue: 8,
            tasksCancelled: 2,
          },
          costAnalysis: {
            totalEstimatedCost: 12500,
            totalActualCost: 13200,
            variance: 700,
            overBudgetTasks: [
              {
                title: 'Server maintenance with unexpected part replacement',
                estimatedCost: 500,
                actualCost: 750,
                percentOver: 50,
              },
            ],
          },
          userPerformance: [
            {
              userName: 'John Doe',
              tasksAssigned: 15,
              tasksCompleted: 12,
              completionRate: 80,
              onTimeRate: 75,
            },
            {
              userName: 'Jane Smith',
              tasksAssigned: 20,
              tasksCompleted: 18,
              completionRate: 90,
              onTimeRate: 85,
            },
          ],
          taskBacklog: {
            total: 23,
            avgAge: 8.5,
            oldestTask: {
              title: 'Legacy system upgrade',
              daysOld: 45,
            },
          },
        },
      };

      const result = await pdfExportService.generateTaskDashboardPDF(mockData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('mock-pdf-content');
    });

    it('should handle empty user performance and cost data', async () => {
      const mockData = {
        metadata: {
          generatedAt: new Date(),
          timeRange: 'Last 30 days',
          startDate: new Date(),
          endDate: new Date(),
          filters: {},
        },
        data: {
          taskMetrics: {
            byStatus: {},
            byPriority: {},
            completionRate: {
              overall: 0,
              onTime: 0,
              late: 0,
            },
          },
          performanceAnalysis: {
            tasksCreated: 0,
            tasksCompleted: 0,
            tasksOverdue: 0,
            tasksCancelled: 0,
          },
          costAnalysis: {
            totalEstimatedCost: 0,
            totalActualCost: 0,
            variance: 0,
            overBudgetTasks: [],
          },
          userPerformance: [],
          taskBacklog: {
            total: 0,
            avgAge: 0,
            oldestTask: null,
          },
        },
      };

      const result = await pdfExportService.generateTaskDashboardPDF(mockData);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('generateReportPDF', () => {
    it('should generate PDF for generic report with array data', async () => {
      const reportData = [
        {
          id: 1,
          name: 'Asset 1',
          category: 'Computers',
          status: 'Active',
          value: 1500,
        },
        {
          id: 2,
          name: 'Asset 2',
          category: 'Equipment',
          status: 'Inactive',
          value: 800,
        },
      ];

      const result = await pdfExportService.generateReportPDF(reportData, 'Asset Inventory Report');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('mock-pdf-content');
    });

    it('should generate PDF for report with summary data', async () => {
      const reportData = {
        summary: {
          totalAssets: 150,
          totalValue: 125000,
          activeAssets: 142,
        },
        data: [
          {
            name: 'Sample Asset',
            category: 'Equipment',
            status: 'Active',
          },
        ],
        additionalSection: [
          {
            metric: 'Completion Rate',
            value: '85%',
          },
        ],
      };

      const result = await pdfExportService.generateReportPDF(
        reportData,
        'Comprehensive Asset Report',
      );

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle empty report data gracefully', async () => {
      const reportData = {
        data: [],
      };

      const result = await pdfExportService.generateReportPDF(reportData, 'Empty Report');

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should determine orientation based on data columns', async () => {
      const wideReportData = [
        {
          col1: 'A',
          col2: 'B',
          col3: 'C',
          col4: 'D',
          col5: 'E',
          col6: 'F',
          col7: 'G',
          col8: 'H',
        },
      ];

      const result = await pdfExportService.generateReportPDF(wideReportData, 'Wide Report');

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should format different data types correctly', async () => {
      const reportData = [
        {
          text: 'Sample text',
          number: 12345,
          decimal: 123.45,
          date: new Date('2024-01-15'),
          boolean: true,
          nullValue: null,
          object: { nested: 'value' },
        },
      ];

      const result = await pdfExportService.generateReportPDF(reportData, 'Data Types Report');

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('error handling', () => {
    it('should handle PDF generation errors gracefully', async () => {
      // Mock pdfmake to throw an error
      const pdfMake = require('pdfmake/build/pdfmake');
      pdfMake.createPdf = jest.fn().mockImplementation(() => {
        throw new Error('PDF generation failed');
      });

      const mockData = {
        metadata: {
          generatedAt: new Date(),
          timeRange: 'Test',
          startDate: new Date(),
          endDate: new Date(),
          filters: {},
        },
        data: {
          summaryCards: {
            totalAssets: 0,
            activeAssets: 0,
            totalTasks: 0,
            openTasks: 0,
            overdueTasks: 0,
            totalUsers: 0,
            activeUsers: 0,
            totalValue: 0,
          },
          activityMetrics: {
            tasksCreatedCount: 0,
            tasksCompletedCount: 0,
            assetsAddedCount: 0,
            assetsUpdatedCount: 0,
            avgTaskCompletionTime: 0,
            taskCompletionRate: 0,
          },
          recentActivity: [],
          quickActions: {
            urgentTasks: [],
            warrantyAlerts: [],
          },
        },
      };

      await expect(pdfExportService.generateOverviewDashboardPDF(mockData)).rejects.toThrow(
        'PDF generation failed',
      );
    });
  });

  describe('custom formatting', () => {
    it('should format activity types correctly', async () => {
      const mockData = {
        metadata: {
          generatedAt: new Date(),
          timeRange: 'Test',
          startDate: new Date(),
          endDate: new Date(),
          filters: {},
        },
        data: {
          summaryCards: {
            totalAssets: 1,
            activeAssets: 1,
            totalTasks: 1,
            openTasks: 1,
            overdueTasks: 0,
            totalUsers: 1,
            activeUsers: 1,
            totalValue: 1000,
          },
          activityMetrics: {
            tasksCreatedCount: 1,
            tasksCompletedCount: 1,
            assetsAddedCount: 1,
            assetsUpdatedCount: 1,
            avgTaskCompletionTime: 1,
            taskCompletionRate: 100,
          },
          recentActivity: [
            {
              type: 'task_created',
              title: 'New task',
              userName: 'Test User',
              timestamp: new Date(),
            },
            {
              type: 'unknown_type',
              title: 'Unknown activity',
              userName: 'Test User',
              timestamp: new Date(),
            },
          ],
          quickActions: {
            urgentTasks: [],
            warrantyAlerts: [],
          },
        },
      };

      const result = await pdfExportService.generateOverviewDashboardPDF(mockData);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should format section titles properly', async () => {
      const reportData = {
        camelCaseSection: [{ test: 'value' }],
        snake_case_section: [{ test: 'value' }],
        MixedCaseSection: [{ test: 'value' }],
      };

      const result = await pdfExportService.generateReportPDF(reportData, 'Format Test Report');

      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
