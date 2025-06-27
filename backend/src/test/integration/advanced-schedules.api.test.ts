import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateAuthToken } from '../helpers';
import type { User, Organization, Asset, AssetTemplate, Location } from '@prisma/client';

describe('Advanced Schedules API Integration Tests', () => {
  let authToken: string;
  let testUser: User;
  let testOrg: Organization;
  let testLocation: Location;
  let testTemplate: AssetTemplate;
  let testAsset: Asset;

  beforeAll(async () => {
    // Create test organization
    testOrg = await prisma.organization.create({
      data: {
        name: 'Test Advanced Schedules Org',
        slug: 'test-advanced-schedules-org',
      },
    });

    // Create test location
    testLocation = await prisma.location.create({
      data: {
        name: 'Test Location',
        address: '123 Test St',
        organizationId: testOrg.id,
      },
    });

    // Create test template
    testTemplate = await prisma.assetTemplate.create({
      data: {
        name: 'Test Template',
        category: 'EQUIPMENT',
        organizationId: testOrg.id,
        fields: [],
      },
    });

    // Create test asset
    testAsset = await prisma.asset.create({
      data: {
        name: 'Test Asset',
        qrCode: 'TEST-ASSET-001',
        status: 'OPERATIONAL',
        organizationId: testOrg.id,
        locationId: testLocation.id,
        templateId: testTemplate.id,
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'advanced.schedules@example.com',
        name: 'Advanced Schedules User',
        organizationId: testOrg.id,
        role: 'ADMIN',
      },
    });

    authToken = await generateAuthToken(testUser);
  });

  afterAll(async () => {
    // Clean up
    await prisma.schedule.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.asset.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.assetTemplate.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.location.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.user.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.organization.delete({ where: { id: testOrg.id } });
  });

  describe('POST /api/advanced-schedules', () => {
    it('should create weekly schedule with specific days', async () => {
      const scheduleData = {
        name: 'Weekly Maintenance',
        description: 'Weekly equipment check',
        frequency: 'WEEKLY',
        interval: 1,
        daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
        timeOfDay: '09:00',
        assetId: testAsset.id,
        estimatedMinutes: 30,
        priority: 'MEDIUM',
      };

      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scheduleData)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: scheduleData.name,
        frequency: scheduleData.frequency,
        interval: scheduleData.interval,
        daysOfWeek: scheduleData.daysOfWeek,
        timeOfDay: scheduleData.timeOfDay,
        isActive: true,
      });
    });

    it('should create monthly schedule with day of month', async () => {
      const scheduleData = {
        name: 'Monthly Inspection',
        description: 'Monthly equipment inspection',
        frequency: 'MONTHLY',
        interval: 1,
        dayOfMonth: 15,
        timeOfDay: '14:00',
        assetId: testAsset.id,
        estimatedMinutes: 120,
        priority: 'HIGH',
      };

      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scheduleData)
        .expect(201);

      expect(response.body).toMatchObject({
        name: scheduleData.name,
        frequency: scheduleData.frequency,
        dayOfMonth: scheduleData.dayOfMonth,
        timeOfDay: scheduleData.timeOfDay,
      });
    });

    it('should create seasonal schedule', async () => {
      const scheduleData = {
        name: 'Seasonal Maintenance',
        description: 'Quarterly equipment maintenance',
        frequency: 'SEASONAL',
        interval: 1,
        seasons: ['SPRING', 'FALL'],
        timeOfDay: '08:00',
        assetId: testAsset.id,
        estimatedMinutes: 240,
        priority: 'HIGH',
      };

      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scheduleData)
        .expect(201);

      expect(response.body).toMatchObject({
        name: scheduleData.name,
        frequency: scheduleData.frequency,
        seasons: scheduleData.seasons,
      });
    });

    it('should create usage-based schedule', async () => {
      const scheduleData = {
        name: 'Usage-Based Maintenance',
        description: 'Maintenance based on usage hours',
        frequency: 'USAGE_BASED',
        usageThreshold: 100,
        usageUnit: 'HOURS',
        assetId: testAsset.id,
        estimatedMinutes: 60,
        priority: 'MEDIUM',
      };

      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scheduleData)
        .expect(201);

      expect(response.body).toMatchObject({
        name: scheduleData.name,
        frequency: scheduleData.frequency,
        usageThreshold: scheduleData.usageThreshold,
        usageUnit: scheduleData.usageUnit,
      });
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should validate frequency-specific fields', async () => {
      // Weekly schedule without daysOfWeek should fail
      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Weekly',
          frequency: 'WEEKLY',
          interval: 1,
          timeOfDay: '09:00',
          assetId: testAsset.id,
          estimatedMinutes: 30,
          priority: 'MEDIUM',
          // Missing daysOfWeek
        })
        .expect(400);

      expect(response.body.error).toContain('daysOfWeek is required for WEEKLY frequency');
    });

    it('should require asset ownership', async () => {
      // Create asset in different organization
      const otherOrg = await prisma.organization.create({
        data: {
          name: 'Other Org',
          slug: 'other-org',
        },
      });

      const otherLocation = await prisma.location.create({
        data: {
          name: 'Other Location',
          address: '456 Other St',
          organizationId: otherOrg.id,
        },
      });

      const otherAsset = await prisma.asset.create({
        data: {
          name: 'Other Asset',
          qrCode: 'OTHER-ASSET-001',
          status: 'OPERATIONAL',
          organizationId: otherOrg.id,
          locationId: otherLocation.id,
          templateId: testTemplate.id,
        },
      });

      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Unauthorized Schedule',
          frequency: 'DAILY',
          interval: 1,
          timeOfDay: '09:00',
          assetId: otherAsset.id,
          estimatedMinutes: 30,
          priority: 'MEDIUM',
        })
        .expect(404);

      expect(response.body.error).toContain('Asset not found');

      // Clean up
      await prisma.asset.delete({ where: { id: otherAsset.id } });
      await prisma.location.delete({ where: { id: otherLocation.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('GET /api/advanced-schedules', () => {
    beforeEach(async () => {
      // Create test schedules
      await prisma.schedule.createMany({
        data: [
          {
            name: 'Daily Schedule',
            frequency: 'DAILY',
            interval: 1,
            timeOfDay: '08:00',
            organizationId: testOrg.id,
            assetId: testAsset.id,
            createdById: testUser.id,
            isActive: true,
            nextRunAt: new Date(),
          },
          {
            name: 'Weekly Schedule',
            frequency: 'WEEKLY',
            interval: 1,
            daysOfWeek: [1, 3, 5],
            timeOfDay: '10:00',
            organizationId: testOrg.id,
            assetId: testAsset.id,
            createdById: testUser.id,
            isActive: true,
            nextRunAt: new Date(),
          },
          {
            name: 'Inactive Schedule',
            frequency: 'MONTHLY',
            interval: 1,
            dayOfMonth: 1,
            timeOfDay: '12:00',
            organizationId: testOrg.id,
            assetId: testAsset.id,
            createdById: testUser.id,
            isActive: false,
            nextRunAt: new Date(),
          },
        ],
      });
    });

    afterEach(async () => {
      await prisma.schedule.deleteMany({
        where: { organizationId: testOrg.id },
      });
    });

    it('should list all schedules', async () => {
      const response = await request(app)
        .get('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.schedules).toHaveLength(3);
      expect(response.body.total).toBe(3);
    });

    it('should filter by active status', async () => {
      const response = await request(app)
        .get('/api/advanced-schedules?isActive=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.schedules).toHaveLength(2);
      expect(response.body.schedules.every((s: any) => s.isActive)).toBe(true);
    });

    it('should filter by frequency', async () => {
      const response = await request(app)
        .get('/api/advanced-schedules?frequency=WEEKLY')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.schedules).toHaveLength(1);
      expect(response.body.schedules[0].frequency).toBe('WEEKLY');
    });

    it('should filter by asset', async () => {
      const response = await request(app)
        .get(`/api/advanced-schedules?assetId=${testAsset.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.schedules).toHaveLength(3);
      expect(response.body.schedules.every((s: any) => s.assetId === testAsset.id)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/advanced-schedules?limit=2&offset=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.schedules).toHaveLength(2);
      expect(response.body.total).toBe(3);
    });
  });

  describe('GET /api/advanced-schedules/:scheduleId', () => {
    let testScheduleId: string;

    beforeEach(async () => {
      const schedule = await prisma.schedule.create({
        data: {
          name: 'Get Test Schedule',
          frequency: 'WEEKLY',
          interval: 1,
          daysOfWeek: [1, 3],
          timeOfDay: '09:00',
          organizationId: testOrg.id,
          assetId: testAsset.id,
          createdById: testUser.id,
          isActive: true,
          nextRunAt: new Date(),
        },
      });
      testScheduleId = schedule.id;
    });

    afterEach(async () => {
      await prisma.schedule.delete({ where: { id: testScheduleId } });
    });

    it('should get schedule details with asset info', async () => {
      const response = await request(app)
        .get(`/api/advanced-schedules/${testScheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testScheduleId,
        name: 'Get Test Schedule',
        frequency: 'WEEKLY',
        daysOfWeek: [1, 3],
        asset: {
          id: testAsset.id,
          name: testAsset.name,
        },
      });
    });

    it('should return 404 for non-existent schedule', async () => {
      await request(app)
        .get('/api/advanced-schedules/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/advanced-schedules/:scheduleId', () => {
    let testScheduleId: string;

    beforeEach(async () => {
      const schedule = await prisma.schedule.create({
        data: {
          name: 'Update Test Schedule',
          frequency: 'DAILY',
          interval: 1,
          timeOfDay: '08:00',
          organizationId: testOrg.id,
          assetId: testAsset.id,
          createdById: testUser.id,
          isActive: true,
          nextRunAt: new Date(),
        },
      });
      testScheduleId = schedule.id;
    });

    afterEach(async () => {
      await prisma.schedule.deleteMany({ where: { id: testScheduleId } });
    });

    it('should update schedule properties', async () => {
      const updates = {
        name: 'Updated Schedule Name',
        frequency: 'WEEKLY',
        daysOfWeek: [1, 2, 3],
        timeOfDay: '10:00',
        priority: 'HIGH',
      };

      const response = await request(app)
        .patch(`/api/advanced-schedules/${testScheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testScheduleId,
        name: updates.name,
        frequency: updates.frequency,
        daysOfWeek: updates.daysOfWeek,
        timeOfDay: updates.timeOfDay,
        priority: updates.priority,
      });
    });

    it('should recalculate next run time when schedule changes', async () => {
      const originalSchedule = await prisma.schedule.findUnique({
        where: { id: testScheduleId },
      });

      await request(app)
        .patch(`/api/advanced-schedules/${testScheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          frequency: 'WEEKLY',
          daysOfWeek: [1],
          timeOfDay: '12:00',
        })
        .expect(200);

      const updatedSchedule = await prisma.schedule.findUnique({
        where: { id: testScheduleId },
      });

      expect(updatedSchedule?.nextRunAt).not.toEqual(originalSchedule?.nextRunAt);
    });

    it('should validate frequency changes', async () => {
      const response = await request(app)
        .patch(`/api/advanced-schedules/${testScheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          frequency: 'WEEKLY',
          // Missing daysOfWeek for WEEKLY frequency
        })
        .expect(400);

      expect(response.body.error).toContain('daysOfWeek is required for WEEKLY frequency');
    });
  });

  describe('DELETE /api/advanced-schedules/:scheduleId', () => {
    let testScheduleId: string;

    beforeEach(async () => {
      const schedule = await prisma.schedule.create({
        data: {
          name: 'Delete Test Schedule',
          frequency: 'DAILY',
          interval: 1,
          timeOfDay: '08:00',
          organizationId: testOrg.id,
          assetId: testAsset.id,
          createdById: testUser.id,
          isActive: true,
          nextRunAt: new Date(),
        },
      });
      testScheduleId = schedule.id;
    });

    it('should delete schedule', async () => {
      await request(app)
        .delete(`/api/advanced-schedules/${testScheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const schedule = await prisma.schedule.findUnique({
        where: { id: testScheduleId },
      });
      expect(schedule).toBeNull();
    });

    it('should return 404 for non-existent schedule', async () => {
      await request(app)
        .delete('/api/advanced-schedules/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('POST /api/advanced-schedules/:scheduleId/toggle', () => {
    let testScheduleId: string;

    beforeEach(async () => {
      const schedule = await prisma.schedule.create({
        data: {
          name: 'Toggle Test Schedule',
          frequency: 'DAILY',
          interval: 1,
          timeOfDay: '08:00',
          organizationId: testOrg.id,
          assetId: testAsset.id,
          createdById: testUser.id,
          isActive: true,
          nextRunAt: new Date(),
        },
      });
      testScheduleId = schedule.id;
    });

    afterEach(async () => {
      await prisma.schedule.deleteMany({ where: { id: testScheduleId } });
    });

    it('should toggle schedule active status', async () => {
      // Toggle to inactive
      const response1 = await request(app)
        .post(`/api/advanced-schedules/${testScheduleId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response1.body.isActive).toBe(false);

      // Toggle back to active
      const response2 = await request(app)
        .post(`/api/advanced-schedules/${testScheduleId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response2.body.isActive).toBe(true);
    });

    it('should return 404 for non-existent schedule', async () => {
      await request(app)
        .post('/api/advanced-schedules/non-existent-id/toggle')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Schedule Validation Logic', () => {
    it('should validate days of week range', async () => {
      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Days Schedule',
          frequency: 'WEEKLY',
          interval: 1,
          daysOfWeek: [0, 8], // Invalid: should be 1-7
          timeOfDay: '09:00',
          assetId: testAsset.id,
          estimatedMinutes: 30,
          priority: 'MEDIUM',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should validate day of month range', async () => {
      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Day of Month Schedule',
          frequency: 'MONTHLY',
          interval: 1,
          dayOfMonth: 32, // Invalid: should be 1-31
          timeOfDay: '09:00',
          assetId: testAsset.id,
          estimatedMinutes: 30,
          priority: 'MEDIUM',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should validate time format', async () => {
      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Time Schedule',
          frequency: 'DAILY',
          interval: 1,
          timeOfDay: '25:00', // Invalid time
          assetId: testAsset.id,
          estimatedMinutes: 30,
          priority: 'MEDIUM',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should validate season values', async () => {
      const response = await request(app)
        .post('/api/advanced-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Season Schedule',
          frequency: 'SEASONAL',
          interval: 1,
          seasons: ['INVALID_SEASON'],
          timeOfDay: '09:00',
          assetId: testAsset.id,
          estimatedMinutes: 30,
          priority: 'MEDIUM',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });
});
