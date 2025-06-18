import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import type { Application } from 'express';
import type Redis from 'ioredis';
import * as speakeasy from 'speakeasy';

import {
  createTestApp,
  setupTestDatabase,
  cleanupTestDatabase,
  setupTestEnvironment,
  testDataGenerators,
  integrationAssertions,
} from './app.setup';
import type { TestDatabaseHelper } from '../helpers';
import { TestAPIHelper } from '../helpers';
import { getRedis } from '../../lib/redis';
import { _test_only_resetFailedAttempts } from '../../middleware/auth';

describe('Authentication API Integration Tests', () => {
  let app: Application;
  let api: TestAPIHelper;
  let dbHelper: TestDatabaseHelper;
  let redisClient: Redis;

  beforeAll(async () => {
    setupTestEnvironment();
    app = createTestApp();
    dbHelper = await setupTestDatabase();

    // Get the app's Redis client instead of creating a new one
    redisClient = getRedis();
  });

  afterAll(async () => {
    await cleanupTestDatabase(dbHelper);
    // Redis cleanup is now handled globally in test/setup.ts
    // Timer cleanup is also handled globally
  });

  beforeEach(async () => {
    jest.clearAllMocks(); // Reset all mock state between tests

    api = new TestAPIHelper(app); // Re-create the helper for each test
    await dbHelper.clearDatabase();
    // Flush Redis to ensure test isolation
    await redisClient.flushdb();
    _test_only_resetFailedAttempts(); // Reset the rate-limiter state
  });

  afterEach(() => {
    // Mock cleanup is handled by jest.clearAllMocks() in beforeEach
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const userData = testDataGenerators.validUser();

      const response = await api.request.post('/api/auth/register').send(userData).expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('organization');
      expect(response.body).toHaveProperty('tokens');

      integrationAssertions.expectValidUser(response.body.user);
      integrationAssertions.expectValidOrganization(response.body.organization);
      integrationAssertions.expectValidTokens(response.body.tokens);

      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.fullName).toBe(userData.fullName);
      expect(response.body.user.role).toBe('OWNER');
      expect(response.body.organization.name).toBe(userData.organizationName);
    });

    test('should reject registration with invalid email', async () => {
      const userData = {
        ...testDataGenerators.validUser(),
        email: 'invalid-email',
      };

      const response = await api.request.post('/api/auth/register').send(userData).expect(400);

      integrationAssertions.expectErrorResponse(response, 400);
      expect(response.body.error).toContain('email');
    });

    test('should reject registration with weak password', async () => {
      const userData = {
        ...testDataGenerators.validUser(),
        password: '123',
      };

      const response = await api.request.post('/api/auth/register').send(userData).expect(400);

      integrationAssertions.expectErrorResponse(response, 400);
      expect(response.body.error).toContain('Password');
    });

    test('should reject registration with duplicate email', async () => {
      const userData = testDataGenerators.validUser();

      // Register first user
      await api.request.post('/api/auth/register').send(userData).expect(201);

      // Try to register with same email
      const duplicateUserData = {
        ...testDataGenerators.validUser(),
        email: userData.email,
      };

      const response = await api.request
        .post('/api/auth/register')
        .send(duplicateUserData)
        .expect(409);

      integrationAssertions.expectErrorResponse(response, 409);
    });

    test('should reject registration without required fields', async () => {
      const response = await api.request.post('/api/auth/register').send({}).expect(400);

      integrationAssertions.expectErrorResponse(response, 400);
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login user with valid credentials', async () => {
      // First register a user
      const userData = testDataGenerators.validUser();
      await api.request.post('/api/auth/register').send(userData).expect(201);

      // Now login
      const loginData = testDataGenerators.validLogin(userData.email);
      const response = await api.request.post('/api/auth/login').send(loginData).expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');

      integrationAssertions.expectValidUser(response.body.user);
      integrationAssertions.expectValidTokens(response.body.tokens);

      expect(response.body.user.email).toBe(userData.email);
    });

    test('should reject login with invalid email', async () => {
      const loginData = testDataGenerators.validLogin('nonexistent@example.com');

      const response = await api.request.post('/api/auth/login').send(loginData).expect(401);

      integrationAssertions.expectErrorResponse(response, 401);
    });

    test('should reject login with invalid password', async () => {
      // Register a user
      const userData = testDataGenerators.validUser();
      await api.request.post('/api/auth/register').send(userData).expect(201);

      // Try login with wrong password
      const loginData = {
        email: userData.email,
        password: 'WrongPassword123!',
      };

      const response = await api.request.post('/api/auth/login').send(loginData).expect(401);

      integrationAssertions.expectErrorResponse(response, 401);
    });

    test('should require 2FA when enabled', async () => {
      // Register and login user
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      // Setup 2FA
      const setupResponse = await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/2fa/setup')
        .expect(200);

      expect(setupResponse.body).toHaveProperty('secret');
      const { secret } = setupResponse.body;

      // Enable 2FA with real TOTP token generated for current time
      const currentTimeSeconds = Math.floor(Date.now() / 1000);
      const validTOTPToken = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
        time: currentTimeSeconds,
      });
      await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/2fa/enable')
        .send({ totpToken: validTOTPToken })
        .expect(200);

      // Now try to login - should require 2FA
      const loginData = testDataGenerators.validLogin(userData.email);
      const response = await api.request.post('/api/auth/login').send(loginData).expect(200);

      expect(response.body).toHaveProperty('requiresTwoFactor', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).not.toHaveProperty('tokens');
    });

    test('should authenticate with valid TOTP token', async () => {
      // Register user and enable 2FA
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      // Setup 2FA
      const setupResponse = await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/2fa/setup')
        .expect(200);

      const { secret } = setupResponse.body;

      // Enable 2FA with real TOTP token
      const currentTimeSeconds1 = Math.floor(Date.now() / 1000);
      const validTOTPToken = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
        time: currentTimeSeconds1,
      });
      await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/2fa/enable')
        .send({ totpToken: validTOTPToken })
        .expect(200);

      // Now login with valid TOTP token - should succeed
      const currentTimeSeconds2 = Math.floor(Date.now() / 1000);
      const loginTOTPToken = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
        time: currentTimeSeconds2,
      });
      const loginData = {
        ...testDataGenerators.validLogin(userData.email),
        totpToken: loginTOTPToken,
      };
      const response = await api.request.post('/api/auth/login').send(loginData).expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body).not.toHaveProperty('requiresTwoFactor');
    });

    test('should reject login with invalid TOTP token', async () => {
      // Register user and enable 2FA
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      // Setup and enable 2FA
      const setupResponse = await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/2fa/setup')
        .expect(200);

      const { secret } = setupResponse.body;

      const currentTimeSeconds = Math.floor(Date.now() / 1000);
      const validTOTPToken = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
        time: currentTimeSeconds,
      });
      await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/2fa/enable')
        .send({ totpToken: validTOTPToken })
        .expect(200);

      // Try to login with invalid TOTP token - should fail
      const loginData = {
        ...testDataGenerators.validLogin(userData.email),
        totpToken: '000000', // Invalid token
      };
      const response = await api.request.post('/api/auth/login').send(loginData).expect(401);

      integrationAssertions.expectErrorResponse(response, 401);
    });

    test('should reject login with invalid request format', async () => {
      const response = await api.request
        .post('/api/auth/login')
        .send({ invalid: 'data' })
        .expect(400);

      integrationAssertions.expectErrorResponse(response, 400);
    });
  });

  describe('POST /api/auth/refresh', () => {
    test('should refresh tokens with valid refresh token', async () => {
      // Register a user to get refresh token
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { refreshToken } = registerResponse.body.tokens;

      // Refresh tokens
      const response = await api.request
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('tokens');
      integrationAssertions.expectValidTokens(response.body.tokens);
    });

    test('should reject refresh with invalid token', async () => {
      const response = await api.request
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      integrationAssertions.expectErrorResponse(response, 401);
    });

    test('should reject refresh without token', async () => {
      const response = await api.request.post('/api/auth/refresh').send({}).expect(400);

      integrationAssertions.expectErrorResponse(response, 400);
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return current user info with valid token', async () => {
      // Register and get token
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      const response = await api.authenticatedRequest(accessToken).get('/api/auth/me').expect(200);

      integrationAssertions.expectValidUser(response.body);
      expect(response.body.email).toBe(userData.email);
    });

    test('should reject request without token', async () => {
      const response = await api.request.get('/api/auth/me').expect(401);

      integrationAssertions.expectErrorResponse(response, 401);
    });

    test('should reject request with invalid token', async () => {
      const response = await api.request
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      integrationAssertions.expectErrorResponse(response, 401);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout successfully with valid token', async () => {
      // Register and get token
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      const response = await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    test('should reject logout without token', async () => {
      const response = await api.request.post('/api/auth/logout').expect(401);

      integrationAssertions.expectErrorResponse(response, 401);
    });
  });

  describe('POST /api/auth/change-password', () => {
    test('should change password with valid credentials', async () => {
      // Register user
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      // Change password
      const passwordData = {
        currentPassword: userData.password,
        newPassword: 'NewTestPassword456!',
      };

      const response = await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/change-password')
        .send(passwordData)
        .expect(200);

      expect(response.body).toHaveProperty('message');

      // Verify can login with new password
      const loginResponse = await api.request
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: passwordData.newPassword,
        })
        .expect(200);

      integrationAssertions.expectValidTokens(loginResponse.body.tokens);
    });

    test('should reject password change with wrong current password', async () => {
      // Register user
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      // Try to change password with wrong current password
      const passwordData = {
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewTestPassword456!',
      };

      const response = await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/change-password')
        .send(passwordData)
        .expect(400);

      integrationAssertions.expectErrorResponse(response, 400);
    });

    test('should reject password change with weak new password', async () => {
      // Register user
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const { accessToken } = registerResponse.body.tokens;

      // Try to change to weak password
      const passwordData = {
        currentPassword: userData.password,
        newPassword: '123',
      };

      const response = await api
        .authenticatedRequest(accessToken)
        .post('/api/auth/change-password')
        .send(passwordData)
        .expect(400);

      integrationAssertions.expectErrorResponse(response, 400);
    });
  });

  describe('API Token Management', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register user and get token
      const userData = testDataGenerators.validUser();
      const registerResponse = await api.request.post('/api/auth/register').send(userData);

      accessToken = registerResponse.body.tokens.accessToken;
    });

    describe('POST /api/auth/tokens', () => {
      test('should create API token successfully', async () => {
        const tokenData = testDataGenerators.validApiToken();

        const response = await api
          .authenticatedRequest(accessToken)
          .post('/api/auth/tokens')
          .send(tokenData)
          .expect(201);

        integrationAssertions.expectValidApiToken(response.body);
        expect(response.body.name).toBe(tokenData.name);
        expect(response.body).toHaveProperty('message');
      });

      test('should create API token with expiration', async () => {
        const tokenData = {
          ...testDataGenerators.validApiToken(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(), // 1 day
        };

        const response = await api
          .authenticatedRequest(accessToken)
          .post('/api/auth/tokens')
          .send(tokenData)
          .expect(201);

        integrationAssertions.expectValidApiToken(response.body);
        expect(response.body.expiresAt).toBeTruthy();
      });

      test('should reject API token creation without name', async () => {
        const response = await api
          .authenticatedRequest(accessToken)
          .post('/api/auth/tokens')
          .send({})
          .expect(400);

        integrationAssertions.expectErrorResponse(response, 400);
      });
    });

    describe('GET /api/auth/tokens', () => {
      test('should list user API tokens', async () => {
        // Create a few tokens
        const tokenData1 = testDataGenerators.validApiToken();
        const tokenData2 = testDataGenerators.validApiToken();

        await api.authenticatedRequest(accessToken).post('/api/auth/tokens').send(tokenData1);

        await api.authenticatedRequest(accessToken).post('/api/auth/tokens').send(tokenData2);

        const response = await api
          .authenticatedRequest(accessToken)
          .get('/api/auth/tokens')
          .expect(200);

        expect(response.body).toHaveProperty('tokens');
        expect(Array.isArray(response.body.tokens)).toBe(true);
        expect(response.body.tokens.length).toBe(2);

        response.body.tokens.forEach((token: any) => {
          expect(token).toHaveProperty('id');
          expect(token).toHaveProperty('name');
          expect(token).toHaveProperty('createdAt');
          expect(token).not.toHaveProperty('token'); // Token value should not be returned in list
        });
      });

      test('should return empty list for user with no tokens', async () => {
        const response = await api
          .authenticatedRequest(accessToken)
          .get('/api/auth/tokens')
          .expect(200);

        expect(response.body).toHaveProperty('tokens');
        expect(Array.isArray(response.body.tokens)).toBe(true);
        expect(response.body.tokens.length).toBe(0);
      });
    });

    describe('DELETE /api/auth/tokens/:tokenId', () => {
      test('should delete API token successfully', async () => {
        // Create token
        const tokenData = testDataGenerators.validApiToken();
        const createResponse = await api
          .authenticatedRequest(accessToken)
          .post('/api/auth/tokens')
          .send(tokenData);

        const tokenId = createResponse.body.id;

        // Delete token
        const response = await api
          .authenticatedRequest(accessToken)
          .delete(`/api/auth/tokens/${tokenId}`)
          .expect(200);

        expect(response.body).toHaveProperty('message');

        // Verify token is deleted
        const listResponse = await api.authenticatedRequest(accessToken).get('/api/auth/tokens');

        expect(listResponse.body.tokens.length).toBe(0);
      });

      test('should reject deletion of non-existent token', async () => {
        const fakeTokenId = '123e4567-e89b-12d3-a456-426614174000';

        const response = await api
          .authenticatedRequest(accessToken)
          .delete(`/api/auth/tokens/${fakeTokenId}`)
          .expect(400);

        integrationAssertions.expectErrorResponse(response, 400);
      });

      test('should reject deletion with invalid token ID format', async () => {
        const response = await api
          .authenticatedRequest(accessToken)
          .delete('/api/auth/tokens/invalid-id')
          .expect(400);

        integrationAssertions.expectErrorResponse(response, 400);
      });
    });
  });
});
