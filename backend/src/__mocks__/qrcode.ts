import { jest } from '@jest/globals';

export default {
  toDataURL: jest.fn(),
  toCanvas: jest.fn(),
  toString: jest.fn(),
  toFile: jest.fn(),
  toFileStream: jest.fn(),
  create: jest.fn(),
};
