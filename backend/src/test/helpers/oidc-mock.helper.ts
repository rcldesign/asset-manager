import { MockAgent, MockPool, setGlobalDispatcher } from 'undici';

/**
 * Simplified OIDC Mock Helper for testing
 * 
 * Uses undici MockAgent to intercept HTTP requests made by openid-client.
 * For now, we'll use simple mock tokens instead of real JWT signing to avoid ES module issues.
 */
export class OidcMockHelper {
  public readonly issuerUrl = 'https://mock-oidc-provider.test';
  public mockAgent: MockAgent;
  private mockPool: MockPool;
  private keyId = `mock-key-${Date.now()}`;

  private constructor() {
    this.mockAgent = new MockAgent({ connections: 1 });
    this.mockAgent.disableNetConnect();
    setGlobalDispatcher(this.mockAgent);
    this.mockPool = this.mockAgent.get(this.issuerUrl);
  }

  /**
   * Create a new OidcMockHelper instance
   */
  public static async create(): Promise<OidcMockHelper> {
    return new OidcMockHelper();
  }

  /**
   * Set up OIDC discovery endpoint and JWKS endpoint
   * Required for client initialization
   */
  public setupDiscovery(): void {
    // Mock the discovery endpoint
    this.mockPool.intercept({
      path: '/.well-known/openid-configuration',
      method: 'GET',
    }).reply(200, {
      issuer: this.issuerUrl,
      authorization_endpoint: `${this.issuerUrl}/auth`,
      token_endpoint: `${this.issuerUrl}/token`,
      userinfo_endpoint: `${this.issuerUrl}/userinfo`,
      jwks_uri: `${this.issuerUrl}/jwks`,
      end_session_endpoint: `${this.issuerUrl}/logout`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      scopes_supported: ['openid', 'email', 'profile'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });

    // Mock the JWKS endpoint with a simple key
    this.mockPool.intercept({
      path: '/jwks',
      method: 'GET',
    }).reply(200, {
      keys: [{
        kty: 'RSA',
        use: 'sig',
        kid: this.keyId,
        alg: 'RS256',
        n: 'mock-key-n-value',
        e: 'AQAB'
      }]
    });
  }

  /**
   * Set up mock for authorization code grant flow
   */
  public setupAuthorizationCodeGrant(
    idTokenClaims: Record<string, any>, 
    audience: string = 'test-client-id'
  ): void {
    const mockIdToken = this.createMockIdToken(idTokenClaims, audience);
    
    this.mockPool.intercept({
      path: '/token',
      method: 'POST',
    }).reply(200, {
      id_token: mockIdToken,
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
    });
  }

  /**
   * Set up mock for userinfo endpoint
   */
  public setupUserInfo(userInfoPayload: Record<string, any>): void {
    this.mockPool.intercept({
      path: '/userinfo',
      method: 'GET',
    }).reply(200, userInfoPayload);
  }

  /**
   * Set up mock for refresh token grant
   */
  public setupRefreshTokenGrant(
    idTokenClaims: Record<string, any>,
    audience: string = 'test-client-id'
  ): void {
    const mockIdToken = this.createMockIdToken(idTokenClaims, audience);
    
    this.mockPool.intercept({
      path: '/token',
      method: 'POST',
    }).reply(200, {
      id_token: mockIdToken,
      access_token: 'mock-refreshed-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
    });
  }

  /**
   * Create a mock ID token for testing (not actually signed)
   * This is a simplified approach to avoid ES module issues with jose
   */
  private createMockIdToken(
    claims: Record<string, any>, 
    audience: string
  ): string {
    const header = {
      alg: 'RS256',
      kid: this.keyId,
      typ: 'JWT'
    };
    
    const payload = {
      iss: this.issuerUrl,
      aud: audience,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims
    };
    
    // Create a mock JWT structure (not actually signed)
    // If openid-client validates signatures, we'll need to implement proper signing
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = 'mock-signature-not-verified';
    
    return `${headerB64}.${payloadB64}.${signature}`;
  }


  /**
   * Reset mock intercepts for the next test
   */
  public reset(): void {
    // Clear all existing intercepts
    this.mockPool = this.mockAgent.get(this.issuerUrl);
  }

  /**
   * Clean up mock agent
   */
  public async cleanup(): Promise<void> {
    this.mockAgent.deactivate();
    await this.mockAgent.close();
  }
}