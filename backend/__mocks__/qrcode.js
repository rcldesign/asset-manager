// Mock for qrcode module
const qrcode = {
  toDataURL: jest.fn((text, options) => {
    return Promise.resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==');
  }),
  toString: jest.fn((text, options) => {
    return Promise.resolve('mocked-qr-code-string');
  }),
  toBuffer: jest.fn((text, options) => {
    return Promise.resolve(Buffer.from('mocked-qr-code-buffer'));
  }),
  toCanvas: jest.fn((canvas, text, options) => {
    return Promise.resolve();
  }),
  toSVG: jest.fn((text, options) => {
    return Promise.resolve('<svg>mocked-qr-code</svg>');
  })
};

module.exports = qrcode;
module.exports.default = qrcode;