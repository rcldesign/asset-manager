// Mock for jsonwebtoken module
const jwt = {
  sign: jest.fn((payload, secret, options) => {
    return 'mocked-jwt-token';
  }),
  verify: jest.fn((token, secret, options) => {
    if (token === 'invalid-token') {
      throw new Error('Invalid token');
    }
    return {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'MEMBER',
      organizationId: 'org-123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
  }),
  decode: jest.fn((token) => ({
    userId: 'user-123',
    email: 'test@example.com',
    role: 'MEMBER',
    organizationId: 'org-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  })),
  TokenExpiredError: class TokenExpiredError extends Error {
    constructor(message, expiredAt) {
      super(message);
      this.name = 'TokenExpiredError';
      this.expiredAt = expiredAt;
    }
  },
  JsonWebTokenError: class JsonWebTokenError extends Error {
    constructor(message) {
      super(message);
      this.name = 'JsonWebTokenError';
    }
  },
  NotBeforeError: class NotBeforeError extends Error {
    constructor(message, date) {
      super(message);
      this.name = 'NotBeforeError';
      this.date = date;
    }
  }
};

// Export as both default and named to handle different import styles
module.exports = jwt;
module.exports.default = jwt;