// Mock for bcrypt module
const bcrypt = {
  hash: jest.fn((data, saltOrRounds) => {
    return Promise.resolve('$2b$12$mocked-hash-value');
  }),
  compare: jest.fn((data, encrypted) => {
    // Return false for any password containing "wrong" to simulate invalid password
    if (data.includes('wrong')) {
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }),
  genSalt: jest.fn(() => Promise.resolve('$2b$12$mocked-salt')),
  hashSync: jest.fn(() => '$2b$12$mocked-hash-sync'),
  compareSync: jest.fn(() => true),
  genSaltSync: jest.fn(() => '$2b$12$mocked-salt-sync'),
  getRounds: jest.fn(() => 12),
};

// Export structure matching the actual bcrypt module
module.exports = bcrypt;