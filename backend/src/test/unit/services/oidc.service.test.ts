import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as client from 'openid-client';
import { OIDCService } from '../../../services/oidc.service';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { ValidationError, ConfigurationError } from '../../../utils/errors';

// Mock dependencies
jest.mock('openid-client');
jest.mock('../../../config');
jest.mock('../../../utils/logger');

const mockClient = client as jest.Mocked<typeof client>;
const mockConfig = config as jest.Mocked<typeof config>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('OIDCService', () => {
  let oidcService: OIDCService;

  const mockOIDCConfig = {
    issuerUrl: 'https://accounts.google.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback',
  };

  const mockConfiguration = {
    serverMetadata: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset logger mock implementations
    mockLogger.info = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.debug = jest.fn();
    mockLogger.warn = jest.fn();

    // Reset config mock
    mockConfig.oidc = mockOIDCConfig;

    // Reset client mocks
    mockClient.discovery = jest.fn();
    mockClient.randomPKCECodeVerifier = jest.fn();
    mockClient.calculatePKCECodeChallenge = jest.fn();
    mockClient.buildAuthorizationUrl = jest.fn();
    mockClient.authorizationCodeGrant = jest.fn();
    mockClient.fetchUserInfo = jest.fn();
    mockClient.refreshTokenGrant = jest.fn();
    mockClient.ClientSecretPost = jest.fn();
  });

  describe('constructor and initialization', () => {
    it('should initialize successfully with valid OIDC config', async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      
      oidcService = new OIDCService();
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockClient.discovery).toHaveBeenCalledWith(
        new URL(mockOIDCConfig.issuerUrl),
        mockOIDCConfig.clientId,
        {
          client_secret: mockOIDCConfig.clientSecret,
          redirect_uris: [mockOIDCConfig.redirectUri],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'client_secret_post',
        },
        expect.any(Function)
      );

      expect(oidcService.isAvailable()).toBe(true);
    });

    it('should handle initialization failure gracefully', async () => {
      mockClient.discovery.mockRejectedValue(new Error('Discovery failed'));
      
      oidcService = new OIDCService();
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize OIDC configuration',
        expect.any(Error)
      );
      expect(oidcService.isAvailable()).toBe(false);
    });

    it('should not initialize when OIDC config is null', () => {
      mockConfig.oidc = null;
      
      oidcService = new OIDCService();

      expect(mockClient.discovery).not.toHaveBeenCalled();
      expect(oidcService.isAvailable()).toBe(false);
    });
  });

  describe('isAvailable', () => {
    beforeEach(async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      oidcService = new OIDCService();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should return true when OIDC is configured and initialized', () => {
      expect(oidcService.isAvailable()).toBe(true);
    });

    it('should return false when config is null', () => {
      mockConfig.oidc = null;
      const service = new OIDCService();
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('generateAuthorizationUrl', () => {
    beforeEach(async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      oidcService = new OIDCService();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should generate authorization URL successfully', async () => {
      const state = 'test-state';
      const nonce = 'test-nonce';
      const codeVerifier = 'test-code-verifier';
      const codeChallenge = 'test-code-challenge';
      const authUrl = new URL('https://accounts.google.com/oauth/authorize?client_id=test');

      mockClient.randomPKCECodeVerifier.mockReturnValue(codeVerifier);
      mockClient.calculatePKCECodeChallenge.mockResolvedValue(codeChallenge);
      mockClient.buildAuthorizationUrl.mockReturnValue(authUrl);

      const result = await oidcService.generateAuthorizationUrl(state, nonce);

      expect(result).toEqual({
        url: authUrl.toString(),
        codeVerifier,
        state,
        nonce,
      });

      expect(mockClient.randomPKCECodeVerifier).toHaveBeenCalled();
      expect(mockClient.calculatePKCECodeChallenge).toHaveBeenCalledWith(codeVerifier);
      expect(mockClient.buildAuthorizationUrl).toHaveBeenCalledWith(mockConfiguration, {
        redirect_uri: mockOIDCConfig.redirectUri,
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
    });

    it('should throw error when OIDC is not configured', async () => {
      const uninitializedService = new OIDCService();
      
      await expect(uninitializedService.generateAuthorizationUrl('state', 'nonce'))
        .rejects
        .toThrow(new ConfigurationError('OIDC is not configured or not available'));
    });

    it('should throw error when URL generation fails', async () => {
      mockClient.randomPKCECodeVerifier.mockImplementation(() => {
        throw new Error('PKCE generation failed');
      });

      await expect(oidcService.generateAuthorizationUrl('state', 'nonce'))
        .rejects
        .toThrow(new ValidationError('Failed to generate authorization URL'));
    });
  });

  describe('exchangeCodeForTokens', () => {
    beforeEach(async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      oidcService = new OIDCService();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const exchangeParams = {
      code: 'auth-code',
      codeVerifier: 'code-verifier',
      expectedState: 'test-state',
      expectedNonce: 'test-nonce',
      receivedState: 'test-state',
    };

    it('should exchange code for tokens successfully', async () => {
      const mockTokenResponse = {
        access_token: 'access-token',
        id_token: 'id-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
      };

      mockClient.authorizationCodeGrant.mockResolvedValue(mockTokenResponse);

      const result = await oidcService.exchangeCodeForTokens(
        exchangeParams.code,
        exchangeParams.codeVerifier,
        exchangeParams.expectedState,
        exchangeParams.expectedNonce,
        exchangeParams.receivedState
      );

      expect(result).toEqual(mockTokenResponse);
      expect(mockClient.authorizationCodeGrant).toHaveBeenCalledWith(
        mockConfiguration,
        new URL(`${mockOIDCConfig.redirectUri}?code=${exchangeParams.code}&state=${exchangeParams.receivedState}`),
        {
          pkceCodeVerifier: exchangeParams.codeVerifier,
          expectedNonce: exchangeParams.expectedNonce,
        }
      );
    });

    it('should throw error for invalid state parameter', async () => {
      await expect(oidcService.exchangeCodeForTokens(
        exchangeParams.code,
        exchangeParams.codeVerifier,
        exchangeParams.expectedState,
        exchangeParams.expectedNonce,
        'invalid-state'
      )).rejects.toThrow(new ValidationError('Invalid state parameter'));
    });

    it('should throw error when OIDC is not configured', async () => {
      const uninitializedService = new OIDCService();
      
      await expect(uninitializedService.exchangeCodeForTokens(
        exchangeParams.code,
        exchangeParams.codeVerifier,
        exchangeParams.expectedState,
        exchangeParams.expectedNonce,
        exchangeParams.receivedState
      )).rejects.toThrow(new ConfigurationError('OIDC is not configured or not available'));
    });

    it('should handle authorization response errors', async () => {
      const authError = new client.AuthorizationResponseError({
        error: 'invalid_grant',
        error_description: 'Authorization code is invalid',
      } as any);

      mockClient.authorizationCodeGrant.mockRejectedValue(authError);

      await expect(oidcService.exchangeCodeForTokens(
        exchangeParams.code,
        exchangeParams.codeVerifier,
        exchangeParams.expectedState,
        exchangeParams.expectedNonce,
        exchangeParams.receivedState
      )).rejects.toThrow(new ValidationError('OIDC authorization error: invalid_grant'));
    });

    it('should handle generic errors during token exchange', async () => {
      mockClient.authorizationCodeGrant.mockRejectedValue(new Error('Network error'));

      await expect(oidcService.exchangeCodeForTokens(
        exchangeParams.code,
        exchangeParams.codeVerifier,
        exchangeParams.expectedState,
        exchangeParams.expectedNonce,
        exchangeParams.receivedState
      )).rejects.toThrow(new ValidationError('Failed to exchange authorization code'));
    });
  });

  describe('getUserInfo', () => {
    beforeEach(async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      oidcService = new OIDCService();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should get user info successfully', async () => {
      const accessToken = 'access-token';
      const mockUserInfo = {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/avatar.jpg',
        email_verified: true,
      };

      mockClient.fetchUserInfo.mockResolvedValue(mockUserInfo);

      const result = await oidcService.getUserInfo(accessToken);

      expect(result).toEqual(mockUserInfo);
      expect(mockClient.fetchUserInfo).toHaveBeenCalledWith(
        mockConfiguration,
        accessToken,
        'Bearer'
      );
    });

    it('should throw error when OIDC is not configured', async () => {
      const uninitializedService = new OIDCService();
      
      await expect(uninitializedService.getUserInfo('access-token'))
        .rejects
        .toThrow(new ConfigurationError('OIDC is not configured or not available'));
    });

    it('should handle errors during user info retrieval', async () => {
      mockClient.fetchUserInfo.mockRejectedValue(new Error('API error'));

      await expect(oidcService.getUserInfo('access-token'))
        .rejects
        .toThrow(new ValidationError('Failed to retrieve user information'));
    });
  });

  describe('refreshTokens', () => {
    beforeEach(async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      oidcService = new OIDCService();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should refresh tokens successfully', async () => {
      const refreshToken = 'refresh-token';
      const mockTokenResponse = {
        access_token: 'new-access-token',
        id_token: 'new-id-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
      };

      mockClient.refreshTokenGrant.mockResolvedValue(mockTokenResponse);

      const result = await oidcService.refreshTokens(refreshToken);

      expect(result).toEqual(mockTokenResponse);
      expect(mockClient.refreshTokenGrant).toHaveBeenCalledWith(
        mockConfiguration,
        refreshToken
      );
    });

    it('should use original refresh token when new one is not provided', async () => {
      const refreshToken = 'refresh-token';
      const mockTokenResponse = {
        access_token: 'new-access-token',
        id_token: 'new-id-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
      };

      mockClient.refreshTokenGrant.mockResolvedValue(mockTokenResponse);

      const result = await oidcService.refreshTokens(refreshToken);

      expect(result.refresh_token).toBe(refreshToken);
    });

    it('should throw error when OIDC is not configured', async () => {
      const uninitializedService = new OIDCService();
      
      await expect(uninitializedService.refreshTokens('refresh-token'))
        .rejects
        .toThrow(new ConfigurationError('OIDC is not configured or not available'));
    });

    it('should handle errors during token refresh', async () => {
      mockClient.refreshTokenGrant.mockRejectedValue(new Error('Token refresh failed'));

      await expect(oidcService.refreshTokens('refresh-token'))
        .rejects
        .toThrow(new ValidationError('Failed to refresh tokens'));
    });
  });

  describe('verifyIdToken', () => {
    beforeEach(async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      oidcService = new OIDCService();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should verify ID token successfully', () => {
      const expectedNonce = 'test-nonce';
      const payload = {
        sub: 'user-123',
        iss: 'https://accounts.google.com',
        aud: 'test-client-id',
        nonce: expectedNonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      };

      const idToken = [
        'header',
        Buffer.from(JSON.stringify(payload)).toString('base64'),
        'signature'
      ].join('.');

      const result = oidcService.verifyIdToken(idToken, expectedNonce);

      expect(result).toEqual(payload);
    });

    it('should throw error for invalid token format', () => {
      const invalidToken = 'invalid.token';
      
      expect(() => oidcService.verifyIdToken(invalidToken, 'nonce'))
        .toThrow(new ValidationError('Invalid ID token format'));
    });

    it('should throw error for missing payload', () => {
      const tokenWithoutPayload = 'header..signature';
      
      expect(() => oidcService.verifyIdToken(tokenWithoutPayload, 'nonce'))
        .toThrow(new ValidationError('Invalid ID token payload'));
    });

    it('should throw error for invalid nonce', () => {
      const payload = {
        sub: 'user-123',
        nonce: 'wrong-nonce',
      };

      const idToken = [
        'header',
        Buffer.from(JSON.stringify(payload)).toString('base64'),
        'signature'
      ].join('.');

      expect(() => oidcService.verifyIdToken(idToken, 'expected-nonce'))
        .toThrow(new ValidationError('Invalid nonce in ID token'));
    });

    it('should throw error when OIDC is not configured', () => {
      const uninitializedService = new OIDCService();
      
      expect(() => uninitializedService.verifyIdToken('token', 'nonce'))
        .toThrow(new ConfigurationError('OIDC is not configured or not available'));
    });

    it('should handle JSON parsing errors', () => {
      const invalidPayload = 'not-json';
      const idToken = [
        'header',
        Buffer.from(invalidPayload).toString('base64'),
        'signature'
      ].join('.');

      expect(() => oidcService.verifyIdToken(idToken, 'nonce'))
        .toThrow(new ValidationError('Invalid ID token'));
    });
  });

  describe('generateLogoutUrl', () => {
    beforeEach(async () => {
      mockClient.discovery.mockResolvedValue(mockConfiguration);
      oidcService = new OIDCService();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should generate logout URL successfully', () => {
      const endSessionEndpoint = 'https://accounts.google.com/logout';
      const idTokenHint = 'id-token-hint';
      const postLogoutRedirectUri = 'http://localhost:3000/logout';

      mockConfiguration.serverMetadata.mockReturnValue({
        end_session_endpoint: endSessionEndpoint,
      });

      const result = oidcService.generateLogoutUrl(idTokenHint, postLogoutRedirectUri);

      const expectedUrl = new URL(endSessionEndpoint);
      expectedUrl.searchParams.set('id_token_hint', idTokenHint);
      expectedUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);

      expect(result).toBe(expectedUrl.toString());
    });

    it('should generate logout URL without optional parameters', () => {
      const endSessionEndpoint = 'https://accounts.google.com/logout';

      mockConfiguration.serverMetadata.mockReturnValue({
        end_session_endpoint: endSessionEndpoint,
      });

      const result = oidcService.generateLogoutUrl();

      expect(result).toBe(endSessionEndpoint);
    });

    it('should return null when provider does not support logout endpoint', () => {
      mockConfiguration.serverMetadata.mockReturnValue({});

      const result = oidcService.generateLogoutUrl();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('OIDC provider does not support logout endpoint');
    });

    it('should return null when OIDC is not configured', () => {
      const uninitializedService = new OIDCService();
      
      const result = uninitializedService.generateLogoutUrl();

      expect(result).toBeNull();
    });

    it('should handle errors during logout URL generation', () => {
      mockConfiguration.serverMetadata.mockImplementation(() => {
        throw new Error('Server metadata error');
      });

      const result = oidcService.generateLogoutUrl();

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate logout URL',
        expect.any(Error)
      );
    });
  });
});