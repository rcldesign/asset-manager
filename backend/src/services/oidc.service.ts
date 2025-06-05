import * as client from 'openid-client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ValidationError, ConfigurationError } from '../utils/errors';

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
  private configuration: client.Configuration | null = null;
  private initialized = false;

  constructor() {
    if (config.oidc) {
      this.initializeConfiguration().catch((error) => {
        logger.error(
          'Failed to initialize OIDC configuration',
          error instanceof Error ? error : undefined,
        );
      });
    }
  }

  private async initializeConfiguration(): Promise<void> {
    if (!config.oidc) {
      throw new ConfigurationError('OIDC configuration is not available');
    }

    try {
      const issuerUrl = new URL(config.oidc.issuerUrl);

      logger.info('Initializing OIDC configuration', {
        issuer: config.oidc.issuerUrl,
        clientId: config.oidc.clientId,
      });

      this.configuration = await client.discovery(
        issuerUrl,
        config.oidc.clientId,
        {
          client_secret: config.oidc.clientSecret,
          redirect_uris: [config.oidc.redirectUri],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'client_secret_post',
        },
        client.ClientSecretPost(config.oidc.clientSecret),
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
    return config.oidc !== null && this.initialized;
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

    if (!config.oidc || !this.configuration) {
      throw new ConfigurationError('OIDC configuration is not available');
    }

    try {
      // Generate PKCE code verifier and challenge for security
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

      const authUrl = client.buildAuthorizationUrl(this.configuration, {
        redirect_uri: config.oidc.redirectUri,
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      logger.debug('Generated OIDC authorization URL', {
        state,
        redirectUri: config.oidc.redirectUri,
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

    if (!config.oidc || !this.configuration) {
      throw new ConfigurationError('OIDC configuration is not available');
    }

    try {
      // Validate state parameter
      if (receivedState !== expectedState) {
        throw new ValidationError('Invalid state parameter');
      }

      // Exchange authorization code for tokens
      const tokenEndpointResponse = await client.authorizationCodeGrant(
        this.configuration,
        new URL(`${config.oidc.redirectUri}?code=${code}&state=${receivedState}`),
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

    if (!this.configuration) {
      throw new ConfigurationError('OIDC configuration is not available');
    }

    try {
      const userInfo = await client.fetchUserInfo(this.configuration, accessToken, 'Bearer');

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

    if (!this.configuration) {
      throw new ConfigurationError('OIDC configuration is not available');
    }

    try {
      const tokenEndpointResponse = await client.refreshTokenGrant(
        this.configuration,
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
   * Verify and decode ID token (using basic validation)
   */
  verifyIdToken(idToken: string, expectedNonce: string): Record<string, unknown> {
    this.ensureConfigured();

    if (!this.configuration) {
      throw new ConfigurationError('OIDC configuration is not available');
    }

    try {
      // For now, we'll do basic verification by decoding the JWT
      // In production, you should use proper JWT verification with the provider's keys
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new ValidationError('Invalid ID token format');
      }

      const payloadPart = parts[1];
      if (!payloadPart) {
        throw new ValidationError('Invalid ID token payload');
      }

      const payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString()) as Record<
        string,
        unknown
      >;

      // Basic nonce validation
      if (payload.nonce !== expectedNonce) {
        throw new ValidationError('Invalid nonce in ID token');
      }

      logger.debug('Successfully verified ID token', {
        sub: payload.sub,
        iss: payload.iss,
        aud: payload.aud,
      });

      return payload;
    } catch (error) {
      logger.error('Failed to verify ID token', error instanceof Error ? error : undefined);
      throw new ValidationError('Invalid ID token');
    }
  }

  /**
   * Generate logout URL
   */
  generateLogoutUrl(idTokenHint?: string, postLogoutRedirectUri?: string): string | null {
    this.ensureConfigured();

    if (!this.configuration) {
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
}

// Export singleton instance
export const oidcService = new OIDCService();
