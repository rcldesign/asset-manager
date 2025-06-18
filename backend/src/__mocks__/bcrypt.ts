import { jest } from '@jest/globals';

export default {
  hash: jest.fn<(data: string | Buffer, saltOrRounds: string | number) => Promise<string>>(),
  compare: jest.fn<(data: string | Buffer, encrypted: string) => Promise<boolean>>(),
  genSalt: jest.fn(),
  genSaltSync: jest.fn(),
  hashSync: jest.fn(),
  compareSync: jest.fn(),
};
