import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import type { Application } from 'express';
import { createTestApp, setupTestDatabase, cleanupTestDatabase, testDataGenerators } from '../integration/app.setup';
import { TestDatabaseHelper, TestAPIHelper } from '../helpers';

describe('E2E: Complete User Lifecycle', () => {
  let app: Application;
  let api: TestAPIHelper;
  let dbHelper: TestDatabaseHelper;

  beforeAll(async () => {
    app = createTestApp();
    api = new TestAPIHelper(app);
    dbHelper = await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase(dbHelper);
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();
  });

  test('Complete user registration and authentication flow', async () => {
    const userData = testDataGenerators.validUser();

    // Step 1: Register new user
    const registerResponse = await api.request
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    expect(registerResponse.body).toHaveProperty('user');
    expect(registerResponse.body).toHaveProperty('organization');
    expect(registerResponse.body).toHaveProperty('tokens');

    const { user, organization, tokens } = registerResponse.body;

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
    const profileResponse = await api.authenticatedRequest(tokens.accessToken)
      .get('/api/auth/me')
      .expect(200);

    expect(profileResponse.body.id).toBe(user.id);
    expect(profileResponse.body.email).toBe(user.email);

    // Step 3: Login with credentials
    const loginResponse = await api.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
      })
      .expect(200);

    expect(loginResponse.body).toHaveProperty('user');
    expect(loginResponse.body).toHaveProperty('tokens');
    expect(loginResponse.body.user.id).toBe(user.id);

    // Step 4: Refresh tokens
    const refreshResponse = await api.request
      .post('/api/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    expect(refreshResponse.body).toHaveProperty('tokens');
    expect(refreshResponse.body.tokens.accessToken).toBeTruthy();
    expect(refreshResponse.body.tokens.refreshToken).toBeTruthy();

    // Step 5: Change password
    const newPassword = 'NewTestPassword789!';
    const changePasswordResponse = await api.authenticatedRequest(tokens.accessToken)
      .post('/api/auth/change-password')
      .send({
        currentPassword: userData.password,
        newPassword,
      })
      .expect(200);

    expect(changePasswordResponse.body.message).toBeTruthy();

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
    const logoutResponse = await api.authenticatedRequest(tokens.accessToken)
      .post('/api/auth/logout')
      .expect(200);

    expect(logoutResponse.body.message).toBeTruthy();
  });

  test('Complete 2FA setup and authentication flow', async () => {
    const userData = testDataGenerators.validUser();

    // Step 1: Register user
    const registerResponse = await api.request
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    const { accessToken } = registerResponse.body.tokens;

    // Step 2: Setup 2FA
    const setup2FAResponse = await api.authenticatedRequest(accessToken)
      .post('/api/auth/2fa/setup')
      .expect(200);

    expect(setup2FAResponse.body).toHaveProperty('secret');
    expect(setup2FAResponse.body).toHaveProperty('qrCode');
    expect(setup2FAResponse.body).toHaveProperty('manualEntryKey');
    expect(setup2FAResponse.body).toHaveProperty('message');

    // Step 3: Enable 2FA (simulate valid TOTP token)
    const enable2FAResponse = await api.authenticatedRequest(accessToken)
      .post('/api/auth/2fa/enable')
      .send({ totpToken: '123456' })
      .expect(200);

    expect(enable2FAResponse.body.message).toBeTruthy();

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
    const loginWith2FAResponse = await api.request
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password,
        totpToken: '123456',
      })
      .expect(200);

    expect(loginWith2FAResponse.body).toHaveProperty('user');
    expect(loginWith2FAResponse.body).toHaveProperty('tokens');
    expect(loginWith2FAResponse.body).not.toHaveProperty('requiresTwoFactor');

    // Step 6: Disable 2FA
    const disable2FAResponse = await api.authenticatedRequest(accessToken)
      .post('/api/auth/2fa/disable')
      .send({ totpToken: '123456' })
      .expect(200);

    expect(disable2FAResponse.body.message).toBeTruthy();

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

    const { accessToken } = registerResponse.body.tokens;

    // Step 2: Create API token
    const tokenData = testDataGenerators.validApiToken();
    const createTokenResponse = await api.authenticatedRequest(accessToken)
      .post('/api/auth/tokens')
      .send(tokenData)
      .expect(201);

    expect(createTokenResponse.body).toHaveProperty('id');
    expect(createTokenResponse.body).toHaveProperty('name');
    expect(createTokenResponse.body).toHaveProperty('token');
    expect(createTokenResponse.body.name).toBe(tokenData.name);

    const { id: tokenId, token: apiToken } = createTokenResponse.body;

    // Step 3: Use API token to authenticate
    const apiAuthResponse = await api.apiTokenRequest(apiToken)
      .get('/api/auth/me')
      .expect(200);

    expect(apiAuthResponse.body.email).toBe(userData.email);

    // Step 4: List API tokens
    const listTokensResponse = await api.authenticatedRequest(accessToken)
      .get('/api/auth/tokens')
      .expect(200);

    expect(listTokensResponse.body).toHaveProperty('tokens');
    expect(listTokensResponse.body.tokens).toHaveLength(1);
    expect(listTokensResponse.body.tokens[0].id).toBe(tokenId);
    expect(listTokensResponse.body.tokens[0].name).toBe(tokenData.name);
    expect(listTokensResponse.body.tokens[0]).not.toHaveProperty('token'); // Token value not in list

    // Step 5: Create another API token with expiration
    const expiringTokenData = {
      ...testDataGenerators.validApiToken(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), // 1 day
    };

    const createExpiringTokenResponse = await api.authenticatedRequest(accessToken)
      .post('/api/auth/tokens')
      .send(expiringTokenData)
      .expect(201);

    expect(createExpiringTokenResponse.body.expiresAt).toBeTruthy();

    // Step 6: List tokens again - should have 2
    const listTokensResponse2 = await api.authenticatedRequest(accessToken)
      .get('/api/auth/tokens')
      .expect(200);

    expect(listTokensResponse2.body.tokens).toHaveLength(2);

    // Step 7: Delete first API token
    const deleteTokenResponse = await api.authenticatedRequest(accessToken)
      .delete(`/api/auth/tokens/${tokenId}`)
      .expect(200);

    expect(deleteTokenResponse.body.message).toBeTruthy();

    // Step 8: Verify API token no longer works
    await api.apiTokenRequest(apiToken)
      .get('/api/auth/me')
      .expect(401);

    // Step 9: List tokens - should have 1 remaining
    const finalListResponse = await api.authenticatedRequest(accessToken)
      .get('/api/auth/tokens')
      .expect(200);

    expect(finalListResponse.body.tokens).toHaveLength(1);
    expect(finalListResponse.body.tokens[0].id).not.toBe(tokenId);
  });

  test('Organization management by owner', async () => {
    const userData = testDataGenerators.validUser();

    // Step 1: Register user (becomes organization owner)
    const registerResponse = await api.request
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    const { user, organization, tokens } = registerResponse.body;

    // Step 2: Get organization details
    const orgResponse = await api.authenticatedRequest(tokens.accessToken)
      .get('/api/organizations/me')
      .expect(200);

    expect(orgResponse.body.id).toBe(organization.id);
    expect(orgResponse.body.name).toBe(organization.name);

    // Step 3: Update organization name
    const newOrgName = `Updated ${userData.organizationName}`;
    const updateOrgResponse = await api.authenticatedRequest(tokens.accessToken)
      .put(`/api/organizations/${organization.id}`)
      .send({ name: newOrgName })
      .expect(200);

    expect(updateOrgResponse.body.name).toBe(newOrgName);

    // Step 4: Get organization members
    const membersResponse = await api.authenticatedRequest(tokens.accessToken)
      .get(`/api/organizations/${organization.id}/members`)
      .expect(200);

    expect(membersResponse.body).toHaveProperty('members');
    expect(membersResponse.body.members).toHaveLength(1);
    expect(membersResponse.body.members[0].id).toBe(user.id);
    expect(membersResponse.body.members[0].role).toBe('OWNER');

    // Step 5: Get organization statistics
    const statsResponse = await api.authenticatedRequest(tokens.accessToken)
      .get(`/api/organizations/${organization.id}/statistics`)
      .expect(200);

    expect(statsResponse.body).toHaveProperty('totalUsers', 1);
    expect(statsResponse.body).toHaveProperty('activeUsers', 1);
    expect(statsResponse.body).toHaveProperty('usersByRole');
    expect(statsResponse.body.usersByRole.OWNER).toBe(1);
    expect(statsResponse.body).toHaveProperty('organizationAge');
  });

  test('Error handling throughout user flows', async () => {
    // Test registration with invalid data
    await api.request
      .post('/api/auth/register')
      .send({ email: 'invalid-email' })
      .expect(400);

    // Test login with non-existent user
    await api.request
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'password' })
      .expect(400);

    // Test accessing protected endpoint without token
    await api.request
      .get('/api/auth/me')
      .expect(401);

    // Test accessing protected endpoint with invalid token
    await api.request
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    // Test refresh with invalid token
    await api.request
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token' })
      .expect(400);

    // Register a valid user for remaining tests
    const userData = testDataGenerators.validUser();
    const registerResponse = await api.request
      .post('/api/auth/register')
      .send(userData);

    const { accessToken } = registerResponse.body.tokens;

    // Test password change with wrong current password
    await api.authenticatedRequest(accessToken)
      .post('/api/auth/change-password')
      .send({
        currentPassword: 'wrong-password',
        newPassword: 'NewPassword123!',
      })
      .expect(400);

    // Test creating API token with invalid data
    await api.authenticatedRequest(accessToken)
      .post('/api/auth/tokens')
      .send({})
      .expect(400);

    // Test deleting non-existent API token
    await api.authenticatedRequest(accessToken)
      .delete('/api/auth/tokens/123e4567-e89b-12d3-a456-426614174000')
      .expect(400);
  });
});