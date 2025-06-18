import { jest } from '@jest/globals';

// Define interfaces for better type safety
interface MockTokenEndpointResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

interface MockUserInfo {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email_verified?: boolean;
}

interface MockServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri: string;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
}

// Mock TokenEndpointResponse structure
const mockTokenEndpointResponse: MockTokenEndpointResponse = {
  access_token: 'mock_access_token',
  id_token: 'mock_id_token',
  refresh_token: 'mock_refresh_token',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'openid email profile',
};

// Mock UserInfo structure
const mockUserInfo: MockUserInfo = {
  sub: 'mock_user_id',
  email: 'test@example.com',
  name: 'Test User',
  given_name: 'Test',
  family_name: 'User',
  picture: 'https://example.com/avatar.jpg',
  email_verified: true,
};

// Mock server metadata
const mockServerMetadata: MockServerMetadata = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/oauth/authorize',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  end_session_endpoint: 'https://accounts.google.com/logout',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'email', 'profile'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  claims_supported: [
    'sub',
    'email',
    'name',
    'given_name',
    'family_name',
    'picture',
    'email_verified',
  ],
};

// Mock Configuration class
class MockConfiguration {
  private _serverMetadata: MockServerMetadata;
  private _clientMetadata: unknown;

  constructor(
    serverMetadata: MockServerMetadata,
    clientId: string,
    clientMetadata?: unknown,
    clientAuth?: unknown,
  ) {
    this._serverMetadata = serverMetadata;
    this._clientMetadata = clientMetadata;
    // We don't need to store clientId and clientAuth for our tests
    void clientId;
    void clientAuth;
  }

  serverMetadata(): MockServerMetadata {
    return this._serverMetadata;
  }

  clientMetadata(): unknown {
    return this._clientMetadata;
  }
}

// Create mock functions for all the methods we'll need
const mockDiscovery = jest.fn();
const mockAuthorizationCodeGrant = jest.fn();
const mockFetchUserInfo = jest.fn();
const mockRefreshTokenGrant = jest.fn();
const mockBuildAuthorizationUrl = jest.fn();
const mockRandomPKCECodeVerifier = jest.fn();
const mockCalculatePKCECodeChallenge = jest.fn();
const mockClientSecretPost = jest.fn();

// Mock AuthorizationResponseError
class MockAuthorizationResponseError extends Error {
  error: string;

  constructor(message: string, error: string = 'access_denied') {
    super(message);
    this.name = 'AuthorizationResponseError';
    this.error = error;
  }
}

// Export all the mocked functions and classes
export const discovery = mockDiscovery;
export const authorizationCodeGrant = mockAuthorizationCodeGrant;
export const fetchUserInfo = mockFetchUserInfo;
export const refreshTokenGrant = mockRefreshTokenGrant;
export const buildAuthorizationUrl = mockBuildAuthorizationUrl;
export const randomPKCECodeVerifier = mockRandomPKCECodeVerifier;
export const calculatePKCECodeChallenge = mockCalculatePKCECodeChallenge;
export const ClientSecretPost = mockClientSecretPost;
export const Configuration = MockConfiguration;
export const AuthorizationResponseError = MockAuthorizationResponseError;

// Helper object for easy access in tests
export const mockOpenIdClient = {
  // Mock functions
  discovery: mockDiscovery,
  authorizationCodeGrant: mockAuthorizationCodeGrant,
  fetchUserInfo: mockFetchUserInfo,
  refreshTokenGrant: mockRefreshTokenGrant,
  buildAuthorizationUrl: mockBuildAuthorizationUrl,
  randomPKCECodeVerifier: mockRandomPKCECodeVerifier,
  calculatePKCECodeChallenge: mockCalculatePKCECodeChallenge,
  ClientSecretPost: mockClientSecretPost,

  // Mock data
  mockTokenEndpointResponse,
  mockUserInfo,
  mockServerMetadata,
  MockConfiguration,
  MockAuthorizationResponseError,

  // Helper to reset all mocks between tests
  reset: (): void => {
    mockDiscovery.mockClear();
    mockAuthorizationCodeGrant.mockClear();
    mockFetchUserInfo.mockClear();
    mockRefreshTokenGrant.mockClear();
    mockBuildAuthorizationUrl.mockClear();
    mockRandomPKCECodeVerifier.mockClear();
    mockCalculatePKCECodeChallenge.mockClear();
    mockClientSecretPost.mockClear();
  },

  // Helper to set up default "happy path" mocks

  setupHappyPath: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDiscovery as any).mockResolvedValue(
      new MockConfiguration(mockServerMetadata, 'test-client-id'),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockAuthorizationCodeGrant as any).mockResolvedValue(mockTokenEndpointResponse);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockFetchUserInfo as any).mockResolvedValue(mockUserInfo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockRefreshTokenGrant as any).mockResolvedValue(mockTokenEndpointResponse);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockBuildAuthorizationUrl as any).mockReturnValue(
      new URL('https://accounts.google.com/oauth/authorize?client_id=test&scope=openid'),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockRandomPKCECodeVerifier as any).mockReturnValue('mock_code_verifier');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockCalculatePKCECodeChallenge as any).mockResolvedValue('mock_code_challenge');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockClientSecretPost as any).mockReturnValue({ auth_method: 'client_secret_post' });
  },
};
