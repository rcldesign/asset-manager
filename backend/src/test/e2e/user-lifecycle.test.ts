import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import type { Application } from 'express';
import Redis from 'ioredis';
import * as speakeasy from 'speakeasy';

import {
  createTestApp,
  setupTestDatabase,
  cleanupTestDatabase,
  setupTestEnvironment,
  testDataGenerators,
} from '../integration/app.setup';
import type { TestDatabaseHelper } from '../helpers';
import { TestAPIHelper } from '../helpers';
import {
  _test_only_resetFailedAttempts,
  _test_only_stopCleanupInterval,
} from '../../middleware/auth';
import { _test_only_stopOidcCleanupInterval } from '../../routes/oidc';

// Test response types
interface TestUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  emailVerified: boolean;
  totpEnabled: boolean;
  isActive: boolean;
}

interface TestOrganization {
  id: string;
  name: string;
}

interface TestTokens {
  accessToken: string;
  refreshToken: string;
}

interface RegisterResponse {
  user: TestUser;
  organization: TestOrganization;
  tokens: TestTokens;
}

interface SetupTwoFAResponse {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
  message: string;
}

// interface LoginWithTwoFAResponse {
//   requiresTwoFactor?: boolean;
//   message?: string;
//   user?: TestUser;
//   tokens?: TestTokens;
// }

interface ApiTokenResponse {
  id: string;
  name: string;
  token: string;
  expiresAt?: string;
}

interface ListTokensResponse {
  tokens: Array<{
    id: string;
    name: string;
    expiresAt?: string;
  }>;
}

interface MessageResponse {
  message: string;
}

interface MembersResponse {
  members: Array<{
    id: string;
    role: string;
    email?: string;
    fullName?: string;
  }>;
}

interface OrganizationStatsResponse {
  totalUsers: number;
  activeUsers: number;
  usersByRole: Record<string, number>;
  organizationAge: number;
}

describe('E2E: Complete User Lifecycle', () => {
  let app: Application;
  let api: TestAPIHelper;
  let dbHelper: TestDatabaseHelper;
  let redisClient: Redis;

  beforeAll(async () => {
    setupTestEnvironment();
    app = createTestApp();
    dbHelper = await setupTestDatabase();

    // Connect to Redis for cleanup
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');
  });

  afterAll(async () => {
    await cleanupTestDatabase(dbHelper);
    // Disconnect from Redis
    if (redisClient) {
      await redisClient.quit();
    }
    _test_only_stopCleanupInterval(); // Stop the auth cleanup timer
    _test_only_stopOidcCleanupInterval(); // Stop the OIDC cleanup timer
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

  test('Complete user registration and authentication flow', async () => {
    const userData = testDataGenerators.validUser();

    // Step 1: Register new user
    const registerResponse = await api.request.post('/api/auth/register').send(userData);

    if (registerResponse.status !== 201) {
      console.error('Registration failed:', registerResponse.body);
    }

    expect(registerResponse.status).toBe(201);

    expect(registerResponse.body).toHaveProperty('user');
    expect(registerResponse.body).toHaveProperty('organization');
    expect(registerResponse.body).toHaveProperty('tokens');

    const { user, organization, tokens } = registerResponse.body as RegisterResponse;

    // Verify user properties
    expect(user.email).toBe(userData.email);
    expect(user.fullName).toBe(userData.fullName);
    expect(user.role).toBe('OWNER');
    expect(user.emailVerified).toBe(false);
    expect(user.totpEnabled).toBe(false);
    expect(user.isActive).toBe(true);

    // Verify organization properties
    expect(organization.name).toBe(userData.organizationName);

    // Verify tokens
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    // Step 2: Use access token to get user profile
    const profileResponse = await api
      .authenticatedRequest(tokens.accessToken)
      .get('/api/auth/me')
      .expect(200);

    const profileData = profileResponse.body as TestUser;
    expect(profileData.id).toBe(user.id);
    expect(profileData.email).toBe(user.email);

    // Step 3: Login with credentials
    const loginResponse = await api.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
      })
      .expect(200);

    const loginData = loginResponse.body as { user: TestUser; tokens: TestTokens };
    expect(loginData).toHaveProperty('user');
    expect(loginData).toHaveProperty('tokens');
    expect(loginData.user.id).toBe(user.id);

    // Step 4: Refresh tokens
    const refreshResponse = await api.request
      .post('/api/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    const refreshData = refreshResponse.body as { tokens: TestTokens };
    expect(refreshData).toHaveProperty('tokens');
    expect(refreshData.tokens.accessToken).toBeTruthy();
    expect(refreshData.tokens.refreshToken).toBeTruthy();

    // Step 5: Change password
    const newPassword = 'NewTestPassword789!';
    const changePasswordResponse = await api
      .authenticatedRequest(tokens.accessToken)
      .post('/api/auth/change-password')
      .send({
        currentPassword: userData.password,
        newPassword,
      })
      .expect(200);

    const changePasswordData = changePasswordResponse.body as MessageResponse;
    expect(changePasswordData.message).toBeTruthy();

    // Step 6: Login with new password
    const newLoginResponse = await api.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: newPassword,
      })
      .expect(200);

    expect(newLoginResponse.body).toHaveProperty('tokens');

    // Step 7: Logout
    const logoutResponse = await api
      .authenticatedRequest(tokens.accessToken)
      .post('/api/auth/logout')
      .expect(200);

    const logoutData = logoutResponse.body as MessageResponse;
    expect(logoutData.message).toBeTruthy();
  });

  test('Complete 2FA setup and authentication flow', async () => {
    const userData = testDataGenerators.validUser();

    // Step 1: Register user
    const registerResponse = await api.request
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    const registerData = registerResponse.body as RegisterResponse;
    const { accessToken } = registerData.tokens;

    // Step 2: Setup 2FA
    const setup2FAResponse = await api
      .authenticatedRequest(accessToken)
      .post('/api/auth/2fa/setup')
      .expect(200);

    expect(setup2FAResponse.body).toHaveProperty('secret');
    expect(setup2FAResponse.body).toHaveProperty('qrCode');
    expect(setup2FAResponse.body).toHaveProperty('manualEntryKey');
    expect(setup2FAResponse.body).toHaveProperty('message');

    const setup2FAData = setup2FAResponse.body as SetupTwoFAResponse;
    const { secret } = setup2FAData;

    // Step 3: Enable 2FA with real TOTP token
    const currentTimeSeconds1 = Math.floor(Date.now() / 1000);
    const enable2FAResponse = await api
      .authenticatedRequest(accessToken)
      .post('/api/auth/2fa/enable')
      .send({
        totpToken: speakeasy.totp({
          secret,
          encoding: 'base32',
          time: currentTimeSeconds1,
        }),
      })
      .expect(200);

    const enable2FAData = enable2FAResponse.body as MessageResponse;
    expect(enable2FAData.message).toBeTruthy();

    // Step 4: Login without 2FA token - should require 2FA
    const loginWithout2FAResponse = await api.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
      })
      .expect(200);

    expect(loginWithout2FAResponse.body).toHaveProperty('requiresTwoFactor', true);
    expect(loginWithout2FAResponse.body).toHaveProperty('message');
    expect(loginWithout2FAResponse.body).not.toHaveProperty('tokens');

    // Step 5: Login with 2FA token
    const currentTimeSeconds2 = Math.floor(Date.now() / 1000);
    const loginWith2FAResponse = await api.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
        totpToken: speakeasy.totp({
          secret,
          encoding: 'base32',
          time: currentTimeSeconds2,
        }),
      })
      .expect(200);

    expect(loginWith2FAResponse.body).toHaveProperty('user');
    expect(loginWith2FAResponse.body).toHaveProperty('tokens');
    expect(loginWith2FAResponse.body).not.toHaveProperty('requiresTwoFactor');

    // Step 6: Disable 2FA
    const currentTimeSeconds3 = Math.floor(Date.now() / 1000);
    const disable2FAResponse = await api
      .authenticatedRequest(accessToken)
      .post('/api/auth/2fa/disable')
      .send({
        totpToken: speakeasy.totp({
          secret,
          encoding: 'base32',
          time: currentTimeSeconds3,
        }),
      })
      .expect(200);

    const disable2FAData = disable2FAResponse.body as MessageResponse;
    expect(disable2FAData.message).toBeTruthy();

    // Step 7: Login without 2FA token - should work now
    const finalLoginResponse = await api.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
      })
      .expect(200);

    expect(finalLoginResponse.body).toHaveProperty('tokens');
    expect(finalLoginResponse.body).not.toHaveProperty('requiresTwoFactor');
  });

  test('Complete API token management flow', async () => {
    const userData = testDataGenerators.validUser();

    // Step 1: Register user
    const registerResponse = await api.request
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    const registerData2 = registerResponse.body as RegisterResponse;
    const { accessToken } = registerData2.tokens;

    // Step 2: Create API token
    const tokenData = testDataGenerators.validApiToken();
    const createTokenResponse = await api
      .authenticatedRequest(accessToken)
      .post('/api/auth/tokens')
      .send(tokenData)
      .expect(201);

    const createTokenData = createTokenResponse.body as ApiTokenResponse;
    expect(createTokenData).toHaveProperty('id');
    expect(createTokenData).toHaveProperty('name');
    expect(createTokenData).toHaveProperty('token');
    expect(createTokenData.name).toBe(tokenData.name);
    const { id: tokenId, token: apiToken } = createTokenData;

    // Step 3: Use API token to authenticate
    const apiAuthResponse = await api.apiTokenRequest(apiToken).get('/api/auth/me').expect(200);

    const apiAuthData = apiAuthResponse.body as TestUser;
    expect(apiAuthData.email).toBe(userData.email);

    // Step 4: List API tokens
    const listTokensResponse = await api
      .authenticatedRequest(accessToken)
      .get('/api/auth/tokens')
      .expect(200);

    const listTokensData = listTokensResponse.body as ListTokensResponse;
    expect(listTokensData).toHaveProperty('tokens');
    expect(listTokensData.tokens).toHaveLength(1);
    expect(listTokensData.tokens[0]!.id).toBe(tokenId);
    expect(listTokensData.tokens[0]!.name).toBe(tokenData.name);
    expect(listTokensData.tokens[0]).not.toHaveProperty('token'); // Token value not in list

    // Step 5: Create another API token with expiration
    const expiringTokenData = {
      ...testDataGenerators.validApiToken(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), // 1 day
    };

    const createExpiringTokenResponse = await api
      .authenticatedRequest(accessToken)
      .post('/api/auth/tokens')
      .send(expiringTokenData)
      .expect(201);

    const createExpiringTokenData = createExpiringTokenResponse.body as ApiTokenResponse;
    expect(createExpiringTokenData.expiresAt).toBeTruthy();

    // Step 6: List tokens again - should have 2
    const listTokensResponse2 = await api
      .authenticatedRequest(accessToken)
      .get('/api/auth/tokens')
      .expect(200);

    const listTokensData2 = listTokensResponse2.body as ListTokensResponse;
    expect(listTokensData2.tokens).toHaveLength(2);

    // Step 7: Delete first API token
    const deleteTokenResponse = await api
      .authenticatedRequest(accessToken)
      .delete(`/api/auth/tokens/${tokenId}`)
      .expect(200);

    const deleteTokenData = deleteTokenResponse.body as MessageResponse;
    expect(deleteTokenData.message).toBeTruthy();

    // Step 8: Verify API token no longer works
    await api.apiTokenRequest(apiToken).get('/api/auth/me').expect(401);

    // Step 9: List tokens - should have 1 remaining
    const finalListResponse = await api
      .authenticatedRequest(accessToken)
      .get('/api/auth/tokens')
      .expect(200);

    const finalListData = finalListResponse.body as ListTokensResponse;
    expect(finalListData.tokens).toHaveLength(1);
    expect(finalListData.tokens[0]!.id).not.toBe(tokenId);
  });

  test('Organization management by owner', async () => {
    const userData = testDataGenerators.validUser();

    // Step 1: Register user (becomes organization owner)
    const registerResponse = await api.request
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    const orgRegisterData = registerResponse.body as RegisterResponse;
    const { user, organization, tokens } = orgRegisterData;

    // Step 2: Get organization details
    const orgResponse = await api
      .authenticatedRequest(tokens.accessToken)
      .get('/api/organizations/me')
      .expect(200);

    const orgData = orgResponse.body as TestOrganization;
    expect(orgData.id).toBe(organization.id);
    expect(orgData.name).toBe(organization.name);

    // Step 3: Update organization name
    const newOrgName = `Updated ${userData.organizationName}`;
    const updateOrgResponse = await api
      .authenticatedRequest(tokens.accessToken)
      .put(`/api/organizations/${organization.id}`)
      .send({ name: newOrgName })
      .expect(200);

    const updateOrgData = updateOrgResponse.body as TestOrganization;
    expect(updateOrgData.name).toBe(newOrgName);

    // Step 4: Get organization members
    const membersResponse = await api
      .authenticatedRequest(tokens.accessToken)
      .get(`/api/organizations/${organization.id}/members`)
      .expect(200);

    const membersData = membersResponse.body as MembersResponse;
    expect(membersData).toHaveProperty('members');
    expect(membersData.members).toHaveLength(1);
    expect(membersData.members[0]!.id).toBe(user.id);
    expect(membersData.members[0]!.role).toBe('OWNER');

    // Step 5: Get organization statistics
    const statsResponse = await api
      .authenticatedRequest(tokens.accessToken)
      .get(`/api/organizations/${organization.id}/statistics`)
      .expect(200);

    const statsData = statsResponse.body as OrganizationStatsResponse;
    expect(statsData).toHaveProperty('totalUsers', 1);
    expect(statsData).toHaveProperty('activeUsers', 1);
    expect(statsData).toHaveProperty('usersByRole');
    expect(statsData.usersByRole['OWNER']).toBe(1);
    expect(statsData).toHaveProperty('organizationAge');
  });

  test('Error handling throughout user flows', async () => {
    // Test registration with invalid data
    await api.request.post('/api/auth/register').send({ email: 'invalid-email' }).expect(400);

    // Test login with non-existent user
    await api.request
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'password' })
      .expect(401);

    // Test accessing protected endpoint without token
    await api.request.get('/api/auth/me').expect(401);

    // Test accessing protected endpoint with invalid token
    await api.request.get('/api/auth/me').set('Authorization', 'Bearer invalid-token').expect(401);

    // Test refresh with invalid token
    await api.request.post('/api/auth/refresh').send({ refreshToken: 'invalid-token' }).expect(401);

    // Register a valid user for remaining tests
    const userData = testDataGenerators.validUser();
    const registerResponse = await api.request.post('/api/auth/register').send(userData);

    const errorRegisterData = registerResponse.body as RegisterResponse;
    const { accessToken } = errorRegisterData.tokens;

    // Test password change with wrong current password
    await api
      .authenticatedRequest(accessToken)
      .post('/api/auth/change-password')
      .send({
        currentPassword: 'wrong-password',
        newPassword: 'NewPassword123!',
      })
      .expect(400);

    // Test creating API token with invalid data
    await api.authenticatedRequest(accessToken).post('/api/auth/tokens').send({}).expect(400);

    // Test deleting non-existent API token
    await api
      .authenticatedRequest(accessToken)
      .delete('/api/auth/tokens/123e4567-e89b-12d3-a456-426614174000')
      .expect(400);
  });
});
