import request from 'supertest';
import express from 'express';
import dashboardRoutes from '../../../routes/dashboards';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    asset: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    task: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    location: {
      findMany: jest.fn(),
    },
    activityStream: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../middleware/auth', () => ({
  authenticateJWT: jest.fn((req, res, next) => {
    req.user = {
      id: 'test-user-id',
      organizationId: 'test-org-id',
      role: 'MANAGER',
    };
    next();
  }),
  requirePermission: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

jest.mock('../../../services/asset.service', () => ({
  AssetService: jest.fn().mockImplementation(() => ({
    getAssetStatistics: jest.fn().mockResolvedValue({
      total: 100,
      byCategory: { HARDWARE: 50, SOFTWARE: 30, OTHER: 20 },
      byStatus: { OPERATIONAL: 80, MAINTENANCE: 15, REPAIR: 5 },
      warrantyExpiring: 5,
    }),
  })),
}));

jest.mock('../../../services/task.service', () => ({
  TaskService: jest.fn().mockImplementation(() => ({
    getTaskStatistics: jest.fn().mockResolvedValue({
      total: 200,
      completed: 150,
      overdue: 10,
    }),
  })),
}));

describe('Dashboard Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/dashboards', dashboardRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/dashboards/overview', () => {
    it('should return dashboard overview data', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      // Mock the prisma calls
      (prisma.asset.count as jest.Mock).mockResolvedValue(100);
      (prisma.asset.groupBy as jest.Mock).mockResolvedValue([
        { status: 'OPERATIONAL', _count: 80 },
        { status: 'MAINTENANCE', _count: 15 },
        { status: 'REPAIR', _count: 5 },
      ]);
      (prisma.task.count as jest.Mock).mockResolvedValue(200);
      (prisma.task.groupBy as jest.Mock).mockResolvedValue([
        { status: 'DONE', _count: 150 },
        { status: 'IN_PROGRESS', _count: 30 },
        { status: 'PLANNED', _count: 20 },
      ]);
      (prisma.user.count as jest.Mock).mockResolvedValue(25);
      (prisma.user.groupBy as jest.Mock).mockResolvedValue([
        { role: 'MANAGER', _count: 5 },
        { role: 'MEMBER', _count: 18 },
        { role: 'VIEWER', _count: 2 },
      ]);
      (prisma.activityStream.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/dashboards/overview')
        .expect(200);

      expect(response.body).toHaveProperty('assets');
      expect(response.body).toHaveProperty('tasks');
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('recentActivity');
      
      expect(response.body.assets).toHaveProperty('total');
      expect(response.body.assets).toHaveProperty('byStatus');
      expect(response.body.assets).toHaveProperty('byCategory');
    });
  });

  describe('GET /api/dashboards/kpis', () => {
    it('should return KPI metrics', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      // Mock the prisma calls for KPI calculation
      (prisma.task.count as jest.Mock)
        .mockResolvedValueOnce(100) // total tasks
        .mockResolvedValueOnce(80); // completed tasks
      
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.asset.count as jest.Mock)
        .mockResolvedValueOnce(50) // total assets
        .mockResolvedValueOnce(45); // operational assets

      const response = await request(app)
        .get('/api/dashboards/kpis?period=month')
        .expect(200);

      expect(response.body).toHaveProperty('taskCompletionRate');
      expect(response.body).toHaveProperty('averageTaskDuration');
      expect(response.body).toHaveProperty('assetUtilization');
      expect(response.body).toHaveProperty('maintenanceCompliance');
    });
  });

  describe('GET /api/dashboards/charts/tasks', () => {
    it('should return task chart data', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      (prisma.task.findMany as jest.Mock).mockResolvedValue([
        {
          id: '1',
          status: 'DONE',
          createdAt: new Date('2023-01-01'),
          completedAt: new Date('2023-01-02'),
        },
        {
          id: '2',
          status: 'IN_PROGRESS',
          createdAt: new Date('2023-01-02'),
          completedAt: null,
        },
      ]);

      const response = await request(app)
        .get('/api/dashboards/charts/tasks')
        .expect(200);

      expect(response.body).toHaveProperty('labels');
      expect(response.body).toHaveProperty('datasets');
      expect(Array.isArray(response.body.labels)).toBe(true);
      expect(Array.isArray(response.body.datasets)).toBe(true);
    });
  });

  describe('GET /api/dashboards/charts/assets', () => {
    it('should return asset chart data', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      (prisma.asset.groupBy as jest.Mock).mockResolvedValue([
        { category: 'HARDWARE', _count: 50 },
        { category: 'SOFTWARE', _count: 30 },
        { category: 'OTHER', _count: 20 },
      ]);

      const response = await request(app)
        .get('/api/dashboards/charts/assets?groupBy=category')
        .expect(200);

      expect(response.body).toHaveProperty('labels');
      expect(response.body).toHaveProperty('datasets');
      expect(Array.isArray(response.body.labels)).toBe(true);
      expect(Array.isArray(response.body.datasets)).toBe(true);
    });
  });
});