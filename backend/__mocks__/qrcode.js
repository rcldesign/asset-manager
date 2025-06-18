module.exports = {
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
  toString: jest.fn(),
  toBuffer: jest.fn(),
};