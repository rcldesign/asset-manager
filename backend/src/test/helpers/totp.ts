import * as speakeasy from 'speakeasy';

/**
 * Test constants for deterministic TOTP testing
 * Based on Zen's guidance for proper 2FA testing
 */

// Fixed secret for all tests (base32 encoded)
export const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

// Fixed point in time (2023-01-01 00:00:00 UTC) in seconds
export const MOCK_TIME_EPOCH_SECONDS = 1672531200;

/**
 * Generate a valid TOTP token for a specific time
 * @param secret - Base32 encoded TOTP secret (defaults to TEST_TOTP_SECRET)
 * @param time - Unix timestamp in seconds (defaults to MOCK_TIME_EPOCH_SECONDS)
 * @returns 6-digit TOTP token
 */
export function generateValidTOTPToken(
  secret: string = TEST_TOTP_SECRET,
  time: number = MOCK_TIME_EPOCH_SECONDS,
): string {
  return speakeasy.totp({
    secret,
    encoding: 'base32',
    time,
  });
}

/**
 * Generate a TOTP token for a past time step (outside the window)
 * @param secret - Base32 encoded TOTP secret (defaults to TEST_TOTP_SECRET)
 * @param baseTime - Base time to generate from (defaults to MOCK_TIME_EPOCH_SECONDS)
 * @param stepsBehind - How many 30-second steps behind (default 3 = 90 seconds)
 * @returns 6-digit TOTP token that should be expired
 */
export function generateExpiredTOTPToken(
  secret: string = TEST_TOTP_SECRET,
  baseTime: number = MOCK_TIME_EPOCH_SECONDS,
  stepsBehind: number = 3,
): string {
  const pastTime = baseTime - stepsBehind * 30;
  return speakeasy.totp({
    secret,
    encoding: 'base32',
    time: pastTime,
  });
}

/**
 * Verify a TOTP token with controlled time
 * @param token - 6-digit TOTP token to verify
 * @param secret - Base32 encoded TOTP secret
 * @param time - Unix timestamp in seconds for verification
 * @param window - Window tolerance (default 1)
 * @returns True if token is valid, false otherwise
 */
export function verifyTOTPTokenAtTime(
  token: string,
  secret: string,
  time: number,
  window: number = 1,
): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    time,
    window,
  });
}

/**
 * Test scenarios for TOTP verification
 */
export const TOTP_TEST_SCENARIOS = {
  // Current time - should be valid
  valid: {
    token: () => generateValidTOTPToken(),
    time: MOCK_TIME_EPOCH_SECONDS,
    shouldPass: true,
    description: 'Valid token at current time',
  },

  // Previous time step within window - should be valid
  previousStepValid: {
    token: () => generateValidTOTPToken(TEST_TOTP_SECRET, MOCK_TIME_EPOCH_SECONDS - 30),
    time: MOCK_TIME_EPOCH_SECONDS,
    shouldPass: true,
    description: 'Token from previous time step (within window)',
  },

  // Next time step within window - should be valid
  nextStepValid: {
    token: () => generateValidTOTPToken(TEST_TOTP_SECRET, MOCK_TIME_EPOCH_SECONDS + 30),
    time: MOCK_TIME_EPOCH_SECONDS,
    shouldPass: true,
    description: 'Token from next time step (within window)',
  },

  // Too far in the past - should be invalid
  expiredToken: {
    token: () => generateExpiredTOTPToken(),
    time: MOCK_TIME_EPOCH_SECONDS,
    shouldPass: false,
    description: 'Expired token (outside window)',
  },

  // Invalid token - should be invalid
  invalidToken: {
    token: () => '000000',
    time: MOCK_TIME_EPOCH_SECONDS,
    shouldPass: false,
    description: 'Invalid token (000000)',
  },

  // Wrong secret - should be invalid
  wrongSecret: {
    token: () => generateValidTOTPToken('WRONGSECRET123456'),
    time: MOCK_TIME_EPOCH_SECONDS,
    shouldPass: false,
    description: 'Token generated with wrong secret',
  },
} as const;
