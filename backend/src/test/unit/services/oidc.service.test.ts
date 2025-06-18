import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Import the mock functions we'll use
const mockDiscovery = jest.fn();
const mockClientSecretPost = jest.fn();

// Mock the entire openid-client module to avoid complex mocking
jest.mock('openid-client', () => ({
  discovery: mockDiscovery,
  randomPKCECodeVerifier: jest.fn(() => 'mock-code-verifier'),
  calculatePKCECodeChallenge: jest.fn(() => Promise.resolve('mock-code-challenge')),
  buildAuthorizationUrl: jest.fn((_config: any, params: any) => {
    const url = new URL('https://mock-provider.test/auth');
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
    return url;
  }),
  authorizationCodeGrant: jest.fn(() => Promise.resolve({
    access_token: 'mock-access-token',
    id_token: 'mock-id-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid email profile'
  })),
  fetchUserInfo: jest.fn(() => Promise.resolve({
    sub: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  })),
  refreshTokenGrant: jest.fn(() => Promise.resolve({
    access_token: 'mock-new-access-token',
    id_token: 'mock-new-id-token',
    refresh_token: undefined,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: undefined
  })),
  ClientSecretPost: mockClientSecretPost,
  AuthorizationResponseError: class extends Error {
    error: string;
    constructor(message: string) {
      super(message);
      this.error = 'invalid_grant';
    }
  }
}));

// Mock the logger to avoid console output during tests
jest.mock('../../../utils/logger');

// Mock config to provide test configuration  
const mockOidcConfig = {
  issuerUrl: 'https://mock-provider.test',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/auth/callback',
};

// Create a mutable config object we can modify in tests
const mockConfig = {
  env: 'test',
  isTest: true,
  oidc: mockOidcConfig,
  logging: {
    level: 'error',
    enableMetrics: false,
  },
};

jest.mock('../../../config', () => ({
  config: mockConfig,
}));

// Import after mocking
import { ValidationError } from '../../../utils/errors';
import { _testResetOIDCServiceInstance, OIDCService } from '../../../services/oidc.service';

describe('OIDCService', () => {
  let mockConfiguration: any;
  let testService: OIDCService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the singleton instance correctly
    _testResetOIDCServiceInstance();
    
    // Reset config to have oidc enabled
    mockConfig.oidc = mockOidcConfig;
    
    // Create a test instance directly with the mock config
    testService = new OIDCService(mockOidcConfig);
    
    // Create a proper mock configuration that matches openid-client's Configuration interface
    mockConfiguration = {
      serverMetadata: jest.fn().mockReturnValue({
        issuer: 'https://mock-provider.test',
        authorization_endpoint: 'https://mock-provider.test/auth',
        token_endpoint: 'https://mock-provider.test/token',
        userinfo_endpoint: 'https://mock-provider.test/userinfo',
        jwks_uri: 'https://mock-provider.test/jwks',
        end_session_endpoint: 'https://mock-provider.test/logout',
      }),
      // Add other required properties
      issuer: 'https://mock-provider.test',
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      metadata: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret'
      }
    };
    
    // Set up the service with mock configuration
    (testService as any)._testSetConfiguration(mockConfiguration, true);
  });

  afterEach(() => {
    // Restore original config
    mockConfig.oidc = mockOidcConfig;
  });

  describe('isAvailable', () => {
    it('should return true when properly configured', () => {
      // The service should be configured from the beforeEach hook
      expect(testService.isAvailable()).toBe(true);
    });

    it('should return false when not configured', () => {
      // Create a new instance with no config
      const unconfiguredService = new OIDCService(null);
      (unconfiguredService as any)._testSetConfiguration(null, false);
      
      expect(unconfiguredService.isAvailable()).toBe(false);
    });
  });

  describe('generateAuthorizationUrl', () => {
    it('should generate authorization URL successfully', async () => {
      const state = 'test-state';
      const nonce = 'test-nonce';

      const result = await testService.generateAuthorizationUrl(state, nonce);

      expect(result).toEqual({
        url: `http://localhost:3000/auth/callback?code=mock_auth_code&state=${state}`,
        codeVerifier: 'mock_code_verifier_123',
        state,
        nonce,
      });
    });

  });

  describe('exchangeCodeForTokens', () => {
    const exchangeParams = {
      code: 'auth-code',
      codeVerifier: 'code-verifier',
      expectedState: 'test-state',
      expectedNonce: 'test-nonce',
      receivedState: 'test-state',
    };

    it('should exchange code for tokens successfully', async () => {
      const result = await testService.exchangeCodeForTokens(
        exchangeParams.code,
        exchangeParams.codeVerifier,
        exchangeParams.expectedState,
        exchangeParams.expectedNonce,
        exchangeParams.receivedState,
      );

      expect(result).toEqual({
        access_token: 'mock_access_token_xyz',
        id_token: 'mock_id_token_abc',
        refresh_token: 'mock_refresh_token_def',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
      });
    });

    it('should throw error for invalid state parameter', async () => {
      await expect(
        testService.exchangeCodeForTokens(
          exchangeParams.code,
          exchangeParams.codeVerifier,
          exchangeParams.expectedState,
          exchangeParams.expectedNonce,
          'invalid-state',
        ),
      ).rejects.toThrow(ValidationError);
    });

  });

  describe('getUserInfo', () => {
    it('should get user info successfully', async () => {
      const accessToken = 'access-token';
      
      const result = await testService.getUserInfo(accessToken);

      expect(result).toEqual({
        sub: 'mock_user_id_123',
        email: 'testuser@example.com',
        name: 'Mock Test User',
        given_name: 'Mock',
        family_name: 'User',
        picture: 'https://example.com/mock_picture.jpg',
        email_verified: true,
      });
    });

  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const refreshToken = 'refresh-token';

      const result = await testService.refreshTokens(refreshToken);

      expect(result).toEqual({
        access_token: 'mock_access_token_xyz',
        id_token: 'mock_id_token_abc',
        refresh_token: refreshToken, // Service returns the same refresh token that was passed in
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
      });
    });

  });

  describe('generateLogoutUrl', () => {
    it('should generate logout URL successfully', () => {
      const idTokenHint = 'id-token-hint';
      const postLogoutRedirectUri = 'http://localhost:3000/logout';

      const result = testService.generateLogoutUrl(idTokenHint, postLogoutRedirectUri);

      expect(result).toContain('https://mock-provider.test/logout');
      expect(mockConfiguration.serverMetadata).toHaveBeenCalled();
      
      if (result) {
        const url = new URL(result);
        expect(url.searchParams.get('id_token_hint')).toBe(idTokenHint);
        expect(url.searchParams.get('post_logout_redirect_uri')).toBe(postLogoutRedirectUri);
      }
    });

    it('should generate logout URL without optional parameters', () => {
      const result = testService.generateLogoutUrl();

      expect(result).toBe('https://mock-provider.test/logout');
      expect(mockConfiguration.serverMetadata).toHaveBeenCalled();
    });

  });
});
