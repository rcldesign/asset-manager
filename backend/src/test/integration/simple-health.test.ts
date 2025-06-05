import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('Simple Health Check', () => {
  test('should create a basic Express app and respond to health check', async () => {
    const app = express();
    
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(typeof response.body.timestamp).toBe('string');
  });
});