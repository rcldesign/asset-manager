/**
 * Manual mock for openid-client to avoid TypeScript deep instantiation issues
 * This mock provides simplified types and implementations for testing
 */

// Define a simplified mock for the Client instance
const mockClientInstance = {
  authorizationUrl: jest.fn().mockReturnValue('https://mock-auth-url.com'),
  callback: jest.fn().mockResolvedValue({
    tokenSet: {
      access_token: 'mock-access-token',
      id_token: 'mock-id-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Date.now() + 3600,
    },
  }),
  userinfo: jest.fn().mockResolvedValue({
    sub: 'mock-user-id',
    name: 'Mock User',
    email: 'mock@example.com',
  }),
  introspect: jest.fn().mockResolvedValue({
    active: true,
    scope: 'openid profile email',
    sub: 'mock-user-id',
  }),
  revoke: jest.fn().mockResolvedValue(undefined),
  refresh: jest.fn().mockResolvedValue({
    tokenSet: {
      access_token: 'mock-refreshed-access-token',
      id_token: 'mock-refreshed-id-token',
      refresh_token: 'mock-refreshed-refresh-token',
      expires_at: Date.now() + 3600,
    },
  }),
  endSessionUrl: jest.fn().mockReturnValue('https://mock-logout-url.com'),
};

// Mock the Client constructor
const MockClient = jest.fn(() => mockClientInstance);

// Define a simplified mock for the Issuer
const mockIssuer = {
  metadata: {
    issuer: 'https://mock-oidc-issuer.com',
    authorization_endpoint: 'https://mock-oidc-issuer.com/auth',
    token_endpoint: 'https://mock-oidc-issuer.com/token',
    userinfo_endpoint: 'https://mock-oidc-issuer.com/userinfo',
    jwks_uri: 'https://mock-oidc-issuer.com/certs',
    end_session_endpoint: 'https://mock-oidc-issuer.com/logout',
  },
  Client: MockClient,
};

// Mock Issuer.discover to return our mock issuer
const Issuer = {
  discover: jest.fn().mockResolvedValue(mockIssuer),
};

// Mock generators for PKCE
const generators = {
  random: jest.fn().mockReturnValue('mock-random-string'),
  codeVerifier: jest.fn().mockReturnValue('mock-code-verifier'),
  codeChallenge: jest.fn().mockReturnValue('mock-code-challenge'),
};

// Mock TokenSet class
const TokenSet = jest.fn().mockImplementation((tokens) => ({
  ...tokens,
  expired: jest.fn().mockReturnValue(false),
  claims: jest.fn().mockReturnValue({
    sub: 'mock-user-id',
    name: 'Mock User',
    email: 'mock@example.com',
  }),
}));

// Additional helper functions
const randomPKCECodeVerifier = jest.fn().mockReturnValue('mock-code-verifier');
const calculatePKCECodeChallenge = jest.fn().mockReturnValue('mock-code-challenge');
const buildAuthorizationUrl = jest.fn().mockReturnValue('https://mock-auth-url.com');
const authorizationCodeGrant = jest.fn().mockResolvedValue({
  access_token: 'mock-access-token',
  id_token: 'mock-id-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600,
});
const fetchUserInfo = jest.fn().mockResolvedValue({
  sub: 'mock-user-id',
  name: 'Mock User',
  email: 'mock@example.com',
});
const refreshTokenGrant = jest.fn().mockResolvedValue({
  access_token: 'mock-refreshed-access-token',
  id_token: 'mock-refreshed-id-token',
  refresh_token: 'mock-refreshed-refresh-token',
  expires_at: Date.now() + 3600,
});

// ClientSecretPost for token endpoint auth method
const ClientSecretPost = jest.fn();

// Mock discovery function
const discovery = jest.fn().mockResolvedValue(mockIssuer);

// Export all mocked modules
module.exports = {
  Issuer,
  generators,
  TokenSet,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  fetchUserInfo,
  refreshTokenGrant,
  ClientSecretPost,
  discovery,
  Client: MockClient,
};