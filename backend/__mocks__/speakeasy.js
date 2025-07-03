// Mock for speakeasy module
const speakeasy = {
  generateSecret: jest.fn(() => ({
    ascii: 'test-secret-key',
    base32: 'JBSWY3DPEHPK3PXP',
    hex: '48656c6c6f21deadbeef',
    qr_code_ascii: 'test-qr-ascii',
    qr_code_hex: 'test-qr-hex',
    qr_code_base32: 'test-qr-base32',
    google_auth_qr: 'test-google-auth-qr',
    otpauth_url: 'otpauth://totp/Test%3Atest%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Test'
  })),
  totp: {
    verify: jest.fn(() => ({ delta: 0 })),
    generate: jest.fn(() => '123456'),
    verifyDelta: jest.fn(() => ({ delta: 0 }))
  },
  time: {
    verify: jest.fn(() => true),
    generate: jest.fn(() => '123456')
  }
};

module.exports = speakeasy;