import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';
import { createTestApp } from './app.setup';

describe('Health Check Integration Tests', () => {
  let app: Application;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('string');

      // Verify timestamp is a valid ISO string
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp instanceof Date).toBe(true);
      expect(!isNaN(timestamp.getTime())).toBe(true);
    });

    test('should return JSON content type', async () => {
      const response = await request(app).get('/health').expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
    });

    test('should be accessible without authentication', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('404 Handler', () => {
    test('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route').expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Route GET /non-existent-route not found');
    });

    test('should return 404 for non-existent API routes', async () => {
      const response = await request(app).get('/api/non-existent').expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Route GET /api/non-existent not found');
    });
  });
});
