import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

// Import modules
import dashboardRoutes from '../../../routes/dashboard';
import { prismaMock } from '../../../test/prisma-singleton';

// Mock middleware
jest.mock('../../../middleware/auth', () => ({
  authenticateJWT: jest.fn((req: any, _res: any, next: any) => {
    req.user = {
      id: 'test-user-id',
      organizationId: 'test-org-id',
      role: 'MANAGER',
    };
    next();
  }),
  requirePermission: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// Mock services
jest.mock('../../../services/asset.service');
jest.mock('../../../services/task.service');

import { AssetService } from '../../../services/asset.service';
import { TaskService } from '../../../services/task.service';


describe('Dashboard Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    // Mock the services
    const mockAssetService = {
      getAssetStatistics: (jest.fn() as any).mockResolvedValue({
        total: 100,
        byCategory: { HARDWARE: 50, SOFTWARE: 30, OTHER: 20 },
        byStatus: { OPERATIONAL: 80, MAINTENANCE: 15, REPAIR: 5 },
        warrantyExpiring: 5,
      }),
    };

    const mockTaskService = {
      getTaskStatistics: (jest.fn() as any).mockResolvedValue({
        total: 200,
        completed: 150,
        overdue: 10,
      }),
    };

    (AssetService as any).mockImplementation(() => mockAssetService);
    (TaskService as any).mockImplementation(() => mockTaskService);

    app = express();
    app.use(express.json());
    app.use('/api/dashboards', dashboardRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/dashboards/overview', () => {
    it('should return dashboard overview data', async () => {
      // Mock the prisma calls using prismaMock
      (prismaMock.asset.count as any).mockResolvedValue(100);
      (prismaMock.asset.groupBy as any).mockResolvedValue([
        { status: 'OPERATIONAL', _count: 80 },
        { status: 'MAINTENANCE', _count: 15 },
        { status: 'REPAIR', _count: 5 },
      ]);
      (prismaMock.task.count as any).mockResolvedValue(200);
      (prismaMock.task.groupBy as any).mockResolvedValue([
        { status: 'DONE', _count: 150 },
        { status: 'IN_PROGRESS', _count: 30 },
        { status: 'PLANNED', _count: 20 },
      ]);
      (prismaMock.user.count as any).mockResolvedValue(25);
      (prismaMock.user.groupBy as any).mockResolvedValue([
        { role: 'MANAGER', _count: 5 },
        { role: 'MEMBER', _count: 18 },
        { role: 'VIEWER', _count: 2 },
      ]);
      (prismaMock.activityStream.findMany as any).mockResolvedValue([]);

      const response = await request(app).get('/api/dashboards/overview').expect(200);

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
      // Mock the prisma calls for KPI calculation
      (prismaMock.task.count as any)
        .mockResolvedValueOnce(100) // total tasks
        .mockResolvedValueOnce(80); // completed tasks

      (prismaMock.task.findMany as any).mockResolvedValue([]);
      (prismaMock.asset.count as any)
        .mockResolvedValueOnce(50) // total assets
        .mockResolvedValueOnce(45); // operational assets

      const response = await request(app).get('/api/dashboards/kpis?period=month').expect(200);

      expect(response.body).toHaveProperty('taskCompletionRate');
      expect(response.body).toHaveProperty('averageTaskDuration');
      expect(response.body).toHaveProperty('assetUtilization');
      expect(response.body).toHaveProperty('maintenanceCompliance');
    });
  });

  describe('GET /api/dashboards/charts/tasks', () => {
    it('should return task chart data', async () => {
      (prismaMock.task.findMany as any).mockResolvedValue([
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

      const response = await request(app).get('/api/dashboards/charts/tasks').expect(200);

      expect(response.body).toHaveProperty('labels');
      expect(response.body).toHaveProperty('datasets');
      expect(Array.isArray(response.body.labels)).toBe(true);
      expect(Array.isArray(response.body.datasets)).toBe(true);
    });
  });

  describe('GET /api/dashboards/charts/assets', () => {
    it('should return asset chart data', async () => {
      (prismaMock.asset.groupBy as any).mockResolvedValue([
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