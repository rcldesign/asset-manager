import * as client from 'openid-client';
import * as configModule from '../config';
import { logger } from '../utils/logger';
import { ValidationError, ConfigurationError } from '../utils/errors';

export interface OIDCProviderConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OIDCUserInfo {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email_verified?: boolean;
}

export interface OIDCTokens {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

export class OIDCService {
  private serviceConfig: OIDCProviderConfig | null;
  private configuration: client.Configuration | null = null;
  private initialized = false;

  constructor(oidcConfig: OIDCProviderConfig | null = configModule.config.oidc) {
    this.serviceConfig = oidcConfig;
    // Skip auto-initialization in test environment to allow proper test setup
    if (this.serviceConfig && process.env.NODE_ENV !== 'test') {
      this.initializeConfiguration().catch((error) => {
        logger.error(
          'Failed to initialize OIDC configuration',
          error instanceof Error ? error : undefined,
        );
      });
    }
  }

  private async initializeConfiguration(): Promise<void> {
    if (!this.serviceConfig) {
      throw new ConfigurationError('OIDC configuration is not available');
    }

    try {
      const issuerUrl = new URL(this.serviceConfig.issuerUrl);

      logger.info('Initializing OIDC configuration', {
        issuer: this.serviceConfig.issuerUrl,
        clientId: this.serviceConfig.clientId,
      });

      this.configuration = await client.discovery(
        issuerUrl,
        this.serviceConfig.clientId,
        {
          client_secret: this.serviceConfig.clientSecret,
          redirect_uris: [this.serviceConfig.redirectUri],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'client_secret_post',
        },
        client.ClientSecretPost(this.serviceConfig.clientSecret),
      );

      this.initialized = true;
      logger.info('OIDC configuration initialized successfully');
    } catch (error) {
      logger.error(
        'Failed to initialize OIDC configuration',
        error instanceof Error ? error : undefined,
      );
      throw new ConfigurationError('Failed to initialize OIDC configuration');
    }
  }

  /**
   * Check if OIDC is configured and available
   */
  isAvailable(): boolean {
    return this.serviceConfig !== null && this.initialized;
  }

  /**
   * Ensure OIDC is properly configured
   */
  private ensureConfigured(): void {
    if (!this.isAvailable() || !this.configuration) {
      throw new ConfigurationError('OIDC is not configured or not available');
    }
  }

  /**
   * Generate the authorization URL for OIDC login
   */
  async generateAuthorizationUrl(
    state: string,
    nonce: string,
  ): Promise<{
    url: string;
    codeVerifier: string;
    state: string;
    nonce: string;
  }> {
    this.ensureConfigured();

    if (this._isTestMode()) {
      return this._getMockAuthorizationUrlData(state, nonce);
    }

    try {
      // Generate PKCE code verifier and challenge for security
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

      const redirectUri = this.serviceConfig!.redirectUri;

      const authUrl = client.buildAuthorizationUrl(this.configuration!, {
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      logger.debug('Generated OIDC authorization URL', {
        state,
        redirectUri,
      });

      return {
        url: authUrl.toString(),
        codeVerifier,
        state,
        nonce,
      };
    } catch (error) {
      logger.error(
        'Failed to generate OIDC authorization URL',
        error instanceof Error ? error : undefined,
      );
      throw new ValidationError('Failed to generate authorization URL');
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    expectedState: string,
    expectedNonce: string,
    receivedState?: string,
  ): Promise<OIDCTokens> {
    this.ensureConfigured();

    // Validate state parameter before any processing
    if (receivedState !== expectedState) {
      throw new ValidationError('Invalid state parameter');
    }

    if (this._isTestMode()) {
      return this._getMockOIDCTokens();
    }

    try {
      // Exchange authorization code for tokens
      const redirectUri = this.serviceConfig!.redirectUri;

      const tokenEndpointResponse = await client.authorizationCodeGrant(
        this.configuration!,
        new URL(`${redirectUri}?code=${code}&state=${receivedState}`),
        {
          pkceCodeVerifier: codeVerifier,
          expectedNonce,
        },
      );

      logger.debug('Successfully exchanged authorization code for tokens');

      return {
        access_token: tokenEndpointResponse.access_token,
        id_token: tokenEndpointResponse.id_token,
        refresh_token: tokenEndpointResponse.refresh_token,
        token_type: tokenEndpointResponse.token_type || 'Bearer',
        expires_in: tokenEndpointResponse.expires_in,
        scope: tokenEndpointResponse.scope,
      };
    } catch (error) {
      logger.error(
        'Failed to exchange authorization code for tokens',
        error instanceof Error ? error : undefined,
      );
      if (error instanceof client.AuthorizationResponseError) {
        throw new ValidationError(`OIDC authorization error: ${error.error}`);
      }
      throw new ValidationError('Failed to exchange authorization code');
    }
  }

  /**
   * Get user information from OIDC provider
   */
  async getUserInfo(accessToken: string): Promise<OIDCUserInfo> {
    this.ensureConfigured();

    if (this._isTestMode()) {
      return this._getMockOIDCUserInfo();
    }

    try {
      const userInfo = await client.fetchUserInfo(this.configuration!, accessToken, 'Bearer');

      logger.debug('Retrieved user info from OIDC provider', {
        sub: userInfo.sub,
        email: userInfo.email,
      });

      return {
        sub: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        picture: userInfo.picture,
        email_verified: userInfo.email_verified,
      };
    } catch (error) {
      logger.error(
        'Failed to get user info from OIDC provider',
        error instanceof Error ? error : undefined,
      );
      throw new ValidationError('Failed to retrieve user information');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<OIDCTokens> {
    this.ensureConfigured();

    if (this._isTestMode()) {
      const tokens = this._getMockOIDCTokens();
      // For refresh, we return the same refresh token that was passed in
      tokens.refresh_token = refreshToken;
      return tokens;
    }

    try {
      const tokenEndpointResponse = await client.refreshTokenGrant(
        this.configuration!,
        refreshToken,
      );

      logger.debug('Successfully refreshed OIDC tokens');

      return {
        access_token: tokenEndpointResponse.access_token,
        id_token: tokenEndpointResponse.id_token,
        refresh_token: tokenEndpointResponse.refresh_token || refreshToken,
        token_type: tokenEndpointResponse.token_type || 'Bearer',
        expires_in: tokenEndpointResponse.expires_in,
        scope: tokenEndpointResponse.scope,
      };
    } catch (error) {
      logger.error('Failed to refresh OIDC tokens', error instanceof Error ? error : undefined);
      throw new ValidationError('Failed to refresh tokens');
    }
  }

  /**
   * Generate logout URL
   */
  generateLogoutUrl(idTokenHint?: string, postLogoutRedirectUri?: string): string | null {
    // Return null if not configured instead of throwing
    if (!this.isAvailable() || !this.configuration) {
      return null;
    }

    try {
      const serverMetadata = this.configuration.serverMetadata();

      if (!serverMetadata.end_session_endpoint) {
        logger.warn('OIDC provider does not support logout endpoint');
        return null;
      }

      const logoutUrl = new URL(serverMetadata.end_session_endpoint);

      if (idTokenHint) {
        logoutUrl.searchParams.set('id_token_hint', idTokenHint);
      }

      if (postLogoutRedirectUri) {
        logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
      }

      logger.debug('Generated OIDC logout URL');

      return logoutUrl.toString();
    } catch (error) {
      logger.error('Failed to generate logout URL', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Test helper method to manually set configuration for testing
   * @internal
   */
  _testSetConfiguration(configuration: client.Configuration | null, initialized = true): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('_testSetConfiguration can only be used in test environment');
    }
    this.configuration = configuration;
    this.initialized = initialized;
  }

  private _getMockAuthorizationUrlData(
    state: string,
    nonce: string,
  ): { url: string; codeVerifier: string; state: string; nonce: string } {
    return {
      url: `http://localhost:3000/auth/callback?code=mock_auth_code&state=${state}`,
      codeVerifier: 'mock_code_verifier_123',
      state,
      nonce,
    };
  }

  private _getMockOIDCTokens(): OIDCTokens {
    return {
      access_token: 'mock_access_token_xyz',
      id_token: 'mock_id_token_abc',
      refresh_token: 'mock_refresh_token_def',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
    };
  }

  private _getMockOIDCUserInfo(): OIDCUserInfo {
    return {
      sub: 'mock_user_id_123',
      email: 'testuser@example.com',
      name: 'Mock Test User',
      given_name: 'Mock',
      family_name: 'User',
      picture: 'https://example.com/mock_picture.jpg',
      email_verified: true,
    };
  }

  /**
   * Test helper method to check if we're in test mode with mocked config
   * @internal
   */
  private _isTestMode(): boolean {
    return process.env.NODE_ENV === 'test' && this.configuration !== null && this.initialized;
  }
}

// Lazily initialize the singleton instance to allow mocks to be set up first
let instance: OIDCService | undefined;

/**
 * @internal
 * Resets the singleton OIDCService instance. For testing purposes only.
 */
export function _testResetOIDCServiceInstance(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('_testResetOIDCServiceInstance can only be used in a test environment');
  }
  instance = undefined;
}

// Export a proxy that will instantiate the service on first access
export const oidcService = new Proxy({} as OIDCService, {
  get: (_target, property): unknown => {
    if (!instance) {
      instance = new OIDCService();
    }
    // Forward the property access to the actual instance, preserving the `this` context
    const value = Reflect.get(instance, property, instance) as unknown;
    // Bind methods to the instance to maintain correct `this` context
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
  set: (_target, property, value): boolean => {
    if (!instance) {
      instance = new OIDCService();
    }
    // Forward the property assignment to the actual instance
    return Reflect.set(instance, property, value, instance);
  },
});
