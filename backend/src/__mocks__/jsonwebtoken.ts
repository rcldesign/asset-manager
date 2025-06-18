import { jest } from '@jest/globals';

export default {
  sign: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn(),
  JsonWebTokenError: jest.fn(),
  TokenExpiredError: jest.fn(),
  NotBeforeError: jest.fn(),
};
