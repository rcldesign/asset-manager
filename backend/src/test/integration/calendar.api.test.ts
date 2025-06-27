import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateAuthToken } from '../helpers';
import { CalendarService } from '../../services/calendar.service';
import type { User, Organization, Asset, AssetTemplate, Location } from '@prisma/client';
import nock from 'nock';

// Mock Google Calendar API
const mockGoogleCalendarAPI = () => {
  return nock('https://www.googleapis.com')
    .persist()
    .get(/\/calendar\/v3\/.*/)
    .reply(200, { items: [] })
    .post(/\/calendar\/v3\/.*/)
    .reply(200, {
      id: 'mock-event-id',
      summary: 'Mock Event',
      start: { dateTime: '2025-06-26T10:00:00Z' },
      end: { dateTime: '2025-06-26T11:00:00Z' },
    })
    .patch(/\/calendar\/v3\/.*/)
    .reply(200, {
      id: 'mock-event-id',
      summary: 'Updated Mock Event',
      start: { dateTime: '2025-06-26T10:00:00Z' },
      end: { dateTime: '2025-06-26T11:00:00Z' },
    })
    .delete(/\/calendar\/v3\/.*/)
    .reply(204);
};

describe('Calendar API Integration Tests', () => {
  let authToken: string;
  let testUser: User;
  let testOrg: Organization;
  let testLocation: Location;
  let testTemplate: AssetTemplate;
  let testAsset: Asset;
  let calendarService: CalendarService;

  beforeAll(async () => {
    // Set up Google Calendar API mocks
    mockGoogleCalendarAPI();

    // Create test organization
    testOrg = await prisma.organization.create({
      data: {
        name: 'Test Calendar Org',
        slug: 'test-calendar-org',
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

    // Create test user with Google tokens
    testUser = await prisma.user.create({
      data: {
        email: 'calendar.test@example.com',
        name: 'Calendar Test User',
        organizationId: testOrg.id,
        role: 'ADMIN',
        googleAccessToken: 'mock-access-token',
        googleRefreshToken: 'mock-refresh-token',
        googleTokenExpiry: new Date(Date.now() + 3600000), // 1 hour from now
      },
    });

    authToken = await generateAuthToken(testUser);
    calendarService = CalendarService.getInstance();
  });

  afterAll(async () => {
    // Clean up
    await prisma.asset.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.assetTemplate.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.location.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.user.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.organization.delete({ where: { id: testOrg.id } });
    nock.cleanAll();
  });

  describe('GET /api/calendar-integration/status', () => {
    it('should return calendar integration status', async () => {
      const response = await request(app)
        .get('/api/calendar-integration/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        isConnected: true,
        calendarId: expect.any(String),
        syncEnabled: expect.any(Boolean),
        lastSyncAt: null, // No sync performed yet
      });
    });

    it('should show disconnected status for user without tokens', async () => {
      // Create user without Google tokens
      const userWithoutTokens = await prisma.user.create({
        data: {
          email: 'no.tokens@example.com',
          name: 'No Tokens User',
          organizationId: testOrg.id,
          role: 'USER',
        },
      });

      const tokenWithoutTokens = await generateAuthToken(userWithoutTokens);

      const response = await request(app)
        .get('/api/calendar-integration/status')
        .set('Authorization', `Bearer ${tokenWithoutTokens}`)
        .expect(200);

      expect(response.body).toMatchObject({
        isConnected: false,
        calendarId: null,
        syncEnabled: false,
        lastSyncAt: null,
      });

      // Clean up
      await prisma.user.delete({ where: { id: userWithoutTokens.id } });
    });

    it('should require authentication', async () => {
      await request(app).get('/api/calendar-integration/status').expect(401);
    });
  });

  describe('POST /api/calendar-integration/connect', () => {
    it('should handle OAuth callback and store tokens', async () => {
      // Mock OAuth token exchange
      nock('https://oauth2.googleapis.com').post('/token').reply(200, {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });

      // Create user without tokens for this test
      const newUser = await prisma.user.create({
        data: {
          email: 'oauth.test@example.com',
          name: 'OAuth Test User',
          organizationId: testOrg.id,
          role: 'USER',
        },
      });

      const newToken = await generateAuthToken(newUser);

      const response = await request(app)
        .post('/api/calendar-integration/connect')
        .set('Authorization', `Bearer ${newToken}`)
        .send({
          code: 'mock-authorization-code',
          state: 'mock-state',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Calendar integration connected successfully',
      });

      // Verify tokens were stored
      const updatedUser = await prisma.user.findUnique({
        where: { id: newUser.id },
      });

      expect(updatedUser?.googleAccessToken).toBe('new-access-token');
      expect(updatedUser?.googleRefreshToken).toBe('new-refresh-token');

      // Clean up
      await prisma.user.delete({ where: { id: newUser.id } });
    });

    it('should handle OAuth errors', async () => {
      // Mock OAuth error response
      nock('https://oauth2.googleapis.com').post('/token').reply(400, {
        error: 'invalid_grant',
        error_description: 'Invalid authorization code',
      });

      const response = await request(app)
        .post('/api/calendar-integration/connect')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          code: 'invalid-code',
          state: 'mock-state',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('Failed to connect calendar'),
      });
    });

    it('should require valid request body', async () => {
      const response = await request(app)
        .post('/api/calendar-integration/connect')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/calendar-integration/disconnect', () => {
    it('should disconnect calendar integration', async () => {
      const response = await request(app)
        .post('/api/calendar-integration/disconnect')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Calendar integration disconnected successfully',
      });

      // Verify tokens were removed
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.googleAccessToken).toBeNull();
      expect(updatedUser?.googleRefreshToken).toBeNull();
      expect(updatedUser?.googleTokenExpiry).toBeNull();

      // Restore tokens for other tests
      await prisma.user.update({
        where: { id: testUser.id },
        data: {
          googleAccessToken: 'mock-access-token',
          googleRefreshToken: 'mock-refresh-token',
          googleTokenExpiry: new Date(Date.now() + 3600000),
        },
      });
    });

    it('should require authentication', async () => {
      await request(app).post('/api/calendar-integration/disconnect').expect(401);
    });
  });

  describe('POST /api/calendar-integration/sync', () => {
    let testSchedule: any;

    beforeEach(async () => {
      // Create a test schedule
      testSchedule = await prisma.schedule.create({
        data: {
          name: 'Test Calendar Schedule',
          description: 'Test schedule for calendar sync',
          frequency: 'WEEKLY',
          organizationId: testOrg.id,
          assetId: testAsset.id,
          createdById: testUser.id,
          isActive: true,
          nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          interval: 1,
          dayOfWeek: 1, // Monday
          timeOfDay: '09:00',
        },
      });
    });

    afterEach(async () => {
      await prisma.schedule.delete({ where: { id: testSchedule.id } });
    });

    it('should sync schedules to Google Calendar', async () => {
      const response = await request(app)
        .post('/api/calendar-integration/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Calendar sync completed'),
        syncedEvents: expect.any(Number),
      });

      // Verify schedule was updated with Google event ID
      const updatedSchedule = await prisma.schedule.findUnique({
        where: { id: testSchedule.id },
      });

      expect(updatedSchedule?.googleEventId).toBe('mock-event-id');
    });

    it('should handle sync errors gracefully', async () => {
      // Mock Google Calendar API to return error
      nock.cleanAll();
      nock('https://www.googleapis.com')
        .post(/\/calendar\/v3\/.*/)
        .reply(500, { error: 'Internal Server Error' });

      const response = await request(app)
        .post('/api/calendar-integration/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Calendar sync completed'),
        syncedEvents: 0,
        errors: expect.any(Array),
      });

      // Restore mocks
      mockGoogleCalendarAPI();
    });

    it('should require Google Calendar connection', async () => {
      // Create user without tokens
      const userWithoutTokens = await prisma.user.create({
        data: {
          email: 'sync.no.tokens@example.com',
          name: 'Sync No Tokens User',
          organizationId: testOrg.id,
          role: 'USER',
        },
      });

      const tokenWithoutTokens = await generateAuthToken(userWithoutTokens);

      const response = await request(app)
        .post('/api/calendar-integration/sync')
        .set('Authorization', `Bearer ${tokenWithoutTokens}`)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Google Calendar not connected',
      });

      // Clean up
      await prisma.user.delete({ where: { id: userWithoutTokens.id } });
    });
  });

  describe('Calendar Service Integration', () => {
    let testSchedule: any;

    beforeEach(async () => {
      testSchedule = await prisma.schedule.create({
        data: {
          name: 'Service Test Schedule',
          description: 'Test schedule for service integration',
          frequency: 'MONTHLY',
          organizationId: testOrg.id,
          assetId: testAsset.id,
          createdById: testUser.id,
          isActive: true,
          nextRunAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
          interval: 1,
          dayOfMonth: 15,
          timeOfDay: '14:30',
        },
      });
    });

    afterEach(async () => {
      await prisma.schedule.deleteMany({ where: { id: testSchedule.id } });
    });

    it('should create calendar event for schedule', async () => {
      const result = await calendarService.createScheduleEvent(testUser.id, testSchedule.id);

      expect(result).toMatchObject({
        success: true,
        eventId: 'mock-event-id',
      });
    });

    it('should update existing calendar event', async () => {
      // First create an event
      await calendarService.createScheduleEvent(testUser.id, testSchedule.id);

      // Update the schedule
      await prisma.schedule.update({
        where: { id: testSchedule.id },
        data: {
          name: 'Updated Schedule Name',
          googleEventId: 'mock-event-id',
        },
      });

      // Update the calendar event
      const result = await calendarService.updateScheduleEvent(testUser.id, testSchedule.id);

      expect(result).toMatchObject({
        success: true,
        eventId: 'mock-event-id',
      });
    });

    it('should delete calendar event', async () => {
      // Create event first
      await prisma.schedule.update({
        where: { id: testSchedule.id },
        data: { googleEventId: 'mock-event-id' },
      });

      const result = await calendarService.deleteScheduleEvent(testUser.id, 'mock-event-id');

      expect(result).toMatchObject({
        success: true,
      });
    });

    it('should handle token refresh', async () => {
      // Mock token refresh
      nock('https://oauth2.googleapis.com').post('/token').reply(200, {
        access_token: 'refreshed-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });

      // Update user with expired token
      await prisma.user.update({
        where: { id: testUser.id },
        data: {
          googleTokenExpiry: new Date(Date.now() - 3600000), // Expired 1 hour ago
        },
      });

      const result = await calendarService.createScheduleEvent(testUser.id, testSchedule.id);

      expect(result).toMatchObject({
        success: true,
        eventId: 'mock-event-id',
      });

      // Verify token was refreshed
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.googleAccessToken).toBe('refreshed-access-token');
    });

    it('should handle different schedule frequencies', async () => {
      const frequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

      for (const frequency of frequencies) {
        const schedule = await prisma.schedule.create({
          data: {
            name: `${frequency} Schedule`,
            description: `Test ${frequency} schedule`,
            frequency: frequency as any,
            organizationId: testOrg.id,
            assetId: testAsset.id,
            createdById: testUser.id,
            isActive: true,
            nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            interval: 1,
            timeOfDay: '10:00',
          },
        });

        const result = await calendarService.createScheduleEvent(testUser.id, schedule.id);

        expect(result.success).toBe(true);

        // Clean up
        await prisma.schedule.delete({ where: { id: schedule.id } });
      }
    });

    it('should handle API rate limiting', async () => {
      // Mock rate limit response
      nock.cleanAll();
      nock('https://www.googleapis.com')
        .post(/\/calendar\/v3\/.*/)
        .reply(429, {
          error: {
            code: 429,
            message: 'Rate limit exceeded',
          },
        });

      const result = await calendarService.createScheduleEvent(testUser.id, testSchedule.id);

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('rate limit'),
      });

      // Restore mocks
      mockGoogleCalendarAPI();
    });
  });
});
