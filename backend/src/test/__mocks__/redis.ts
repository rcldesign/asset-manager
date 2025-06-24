/**
 * Mock implementation of redis module for tests
 * Prevents actual Redis connections during testing
 */

// Mock Redis client
export const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),
  flushdb: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
  off: jest.fn(),
};

// Mock functions
export const getRedis = jest.fn(() => mockRedisClient);
export const createRedisConnection = jest.fn(() => mockRedisClient);
export const connectRedis = jest.fn().mockResolvedValue(undefined);
export const disconnectRedis = jest.fn().mockResolvedValue(undefined);

// Export the mock client as redisClient
export const redisClient = mockRedisClient;

// Reset all mocks utility
export const resetRedisMocks = () => {
  mockRedisClient.connect.mockClear();
  mockRedisClient.disconnect.mockClear();
  mockRedisClient.quit.mockClear();
  mockRedisClient.get.mockClear();
  mockRedisClient.set.mockClear();
  mockRedisClient.del.mockClear();
  mockRedisClient.exists.mockClear();
  mockRedisClient.expire.mockClear();
  mockRedisClient.ttl.mockClear();
  mockRedisClient.keys.mockClear();
  mockRedisClient.flushdb.mockClear();
  mockRedisClient.on.mockClear();
  mockRedisClient.off.mockClear();
  
  getRedis.mockClear();
  createRedisConnection.mockClear();
  connectRedis.mockClear();
  disconnectRedis.mockClear();
};