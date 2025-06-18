import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Override the global crypto mock for this test
jest.unmock('crypto');

import {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  generateQRCode,
} from '../../../utils/auth';
import { config } from '../../../config';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));
jest.mock('../../../middleware/security', () => ({
  validateJWTStructure: jest.fn().mockReturnValue(true),
}));

// Import the actual modules to get proper types
import jwt from 'jsonwebtoken';
import qrcode from 'qrcode';

const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockQRCode = qrcode as any;

describe('Auth Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the mock for validateJWTStructure
    const {
      validateJWTStructure,
    }: {
      validateJWTStructure: jest.MockedFunction<() => boolean>;
    } = jest.requireMock('../../../middleware/security');
    validateJWTStructure.mockReturnValue(true);

    // Set test environment variables
    process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-long';
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Note: don't use resetAllMocks as it resets the mock implementation
  });

  describe('generateTokens', () => {
    test('should generate access and refresh tokens', () => {
      const payload = {
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER' as const,
      };

      const mockAccessToken = 'mock-access-token';
      const mockRefreshToken = 'mock-refresh-token';

      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce(mockAccessToken) // Access token
        .mockReturnValueOnce(mockRefreshToken); // Refresh token

      const result = generateTokens(payload);

      expect(mockJwt.sign).toHaveBeenCalledTimes(2);

      // Access token call - should match the actual implementation
      expect(mockJwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          ...payload,
          type: 'access',
          jti: expect.stringMatching(/-access$/),
        }),
        config.jwt.accessSecret,
        expect.objectContaining({
          expiresIn: config.jwt.accessExpiry,
          issuer: 'dumbassets-enhanced',
          audience: 'dumbassets-api',
          algorithm: 'HS256',
        }),
      );

      // Refresh token call
      expect(mockJwt.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          ...payload,
          type: 'refresh',
          jti: expect.stringMatching(/-refresh$/),
        }),
        config.jwt.refreshSecret,
        expect.objectContaining({
          expiresIn: config.jwt.refreshExpiry,
          issuer: 'dumbassets-enhanced',
          audience: 'dumbassets-api',
          algorithm: 'HS256',
        }),
      );

      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        accessTokenExpiry: expect.any(Number),
        refreshTokenExpiry: expect.any(Number),
        tokenId: expect.any(String),
      });
    });

    test('should generate tokens with correct payload structure', () => {
      const payload = {
        userId: 'user-456',
        organizationId: 'org-456',
        role: 'OWNER' as const,
      };

      (mockJwt.sign as jest.Mock).mockReturnValue('mock-token');

      generateTokens(payload);

      // Verify access token payload includes all required fields
      const accessTokenCall = mockJwt.sign.mock.calls[0];
      expect(accessTokenCall?.[0]).toEqual(
        expect.objectContaining({
          userId: payload.userId,
          organizationId: payload.organizationId,
          role: payload.role,
          type: 'access',
          jti: expect.stringMatching(/-access$/),
        }),
      );

      // Verify refresh token payload includes all required fields
      const refreshTokenCall = mockJwt.sign.mock.calls[1];
      expect(refreshTokenCall?.[0]).toEqual(
        expect.objectContaining({
          userId: payload.userId,
          organizationId: payload.organizationId,
          role: payload.role,
          type: 'refresh',
          jti: expect.stringMatching(/-refresh$/),
        }),
      );
    });
  });

  describe('verifyAccessToken', () => {
    test('should verify valid access token', () => {
      const token = 'valid-access-token';
      const expectedPayload = {
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER',
        type: 'access' as const,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(expectedPayload);

      const result = verifyAccessToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(
        token,
        config.jwt.accessSecret,
        expect.objectContaining({
          issuer: 'dumbassets-enhanced',
          audience: 'dumbassets-api',
          algorithms: ['HS256'],
        }),
      );
      expect(result).toEqual(expectedPayload);
    });

    test('should throw error for invalid token', () => {
      const token = 'invalid-token';
      const error = new Error('Invalid token');

      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => verifyAccessToken(token)).toThrow('Token verification failed');
      expect(mockJwt.verify).toHaveBeenCalledWith(
        token,
        config.jwt.accessSecret,
        expect.objectContaining({
          issuer: 'dumbassets-enhanced',
          audience: 'dumbassets-api',
          algorithms: ['HS256'],
        }),
      );
    });

    test('should throw error for expired token', () => {
      const token = 'expired-token';
      const error = new jwt.TokenExpiredError('Token expired', new Date());

      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => verifyAccessToken(token)).toThrow('Access token expired');
    });

    test('should throw error for malformed token', () => {
      const token = 'malformed-token';
      const error = new jwt.JsonWebTokenError('Malformed token');

      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => verifyAccessToken(token)).toThrow('Invalid access token');
    });
  });

  describe('verifyRefreshToken', () => {
    test('should verify valid refresh token', () => {
      const token = 'valid-refresh-token';
      const expectedPayload = {
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER',
        type: 'refresh' as const,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 604800, // 7 days
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(expectedPayload);

      const result = verifyRefreshToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(
        token,
        config.jwt.refreshSecret,
        expect.objectContaining({
          issuer: 'dumbassets-enhanced',
          audience: 'dumbassets-api',
          algorithms: ['HS256'],
        }),
      );
      expect(result).toEqual(expectedPayload);
    });

    test('should throw error for invalid refresh token', () => {
      const token = 'invalid-refresh-token';
      const error = new Error('Invalid refresh token');

      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => verifyRefreshToken(token)).toThrow('Token verification failed');
      expect(mockJwt.verify).toHaveBeenCalledWith(
        token,
        config.jwt.refreshSecret,
        expect.objectContaining({
          issuer: 'dumbassets-enhanced',
          audience: 'dumbassets-api',
          algorithms: ['HS256'],
        }),
      );
    });

    test('should use correct secret for refresh token verification', () => {
      const token = 'test-token';

      (mockJwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER',
        type: 'refresh' as const,
      });

      verifyRefreshToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(
        token,
        config.jwt.refreshSecret,
        expect.objectContaining({
          issuer: 'dumbassets-enhanced',
          audience: 'dumbassets-api',
          algorithms: ['HS256'],
        }),
      );
      // Ensure it's not using the access token secret
      expect(mockJwt.verify).not.toHaveBeenCalledWith(
        token,
        config.jwt.accessSecret,
        expect.any(Object),
      );
    });
  });

  describe('generateQRCode', () => {
    test('should generate QR code data URL', async () => {
      const otpauthUrl = 'otpauth://totp/test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Test';
      const expectedDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';

      mockQRCode.toDataURL.mockResolvedValue(expectedDataUrl);

      const result = await generateQRCode(otpauthUrl);

      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(otpauthUrl);
      expect(result).toBe(expectedDataUrl);
    });

    test('should handle QR code generation errors', async () => {
      const otpauthUrl = 'invalid-otpauth-url';
      const error = new Error('Invalid URL format');

      mockQRCode.toDataURL.mockRejectedValue(error);

      await expect(generateQRCode(otpauthUrl)).rejects.toThrow('Invalid URL format');
    });

    test('should call toDataURL with correct URL', async () => {
      const otpauthUrl = 'otpauth://totp/test@example.com?secret=TEST&issuer=App';

      mockQRCode.toDataURL.mockResolvedValue('mock-data-url');

      await generateQRCode(otpauthUrl);

      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(otpauthUrl);
    });

    test('should generate QR code for TOTP URLs with special characters', async () => {
      const otpauthUrl =
        'otpauth://totp/My%20App%3Auser%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=My%20App';
      const dataUrl = 'data:image/png;base64,mockdata';

      mockQRCode.toDataURL.mockResolvedValue(dataUrl);

      const result = await generateQRCode(otpauthUrl);

      expect(result).toBe(dataUrl);
      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(otpauthUrl);
    });
  });

  describe('Token integration', () => {
    test('should generate and verify tokens end-to-end', () => {
      // Mock the token generation
      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce('mock-access-token')
        .mockReturnValueOnce('mock-refresh-token');

      const payload = {
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER' as const,
      };

      const tokens = generateTokens(payload);

      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
      expect(tokens.accessToken).toBe('mock-access-token');
      expect(tokens.refreshToken).toBe('mock-refresh-token');

      // Mock the verification
      (mockJwt.verify as jest.Mock).mockImplementation((token) => {
        if (token === 'mock-access-token') {
          return {
            ...payload,
            type: 'access',
            iat: Date.now() / 1000,
            exp: Date.now() / 1000 + 900,
          };
        } else if (token === 'mock-refresh-token') {
          return {
            userId: payload.userId,
            type: 'refresh',
            iat: Date.now() / 1000,
            exp: Date.now() / 1000 + 604800,
          };
        }
        throw new Error('Invalid token');
      });

      // Verify tokens can be decoded
      const accessPayload = verifyAccessToken('mock-access-token');
      const refreshPayload = verifyRefreshToken('mock-refresh-token');

      expect(accessPayload.userId).toBe(payload.userId);
      expect(accessPayload.organizationId).toBe(payload.organizationId);
      expect(accessPayload.role).toBe(payload.role);

      expect(refreshPayload.userId).toBe(payload.userId);
      expect(refreshPayload).not.toHaveProperty('organizationId');
      expect(refreshPayload).not.toHaveProperty('role');
    });

    test('should reject tokens signed with wrong secret', () => {
      const payload = {
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER' as const,
      };

      const tokens = generateTokens(payload);

      // Change the secret
      process.env.JWT_SECRET = 'different-secret-32-characters-long';

      expect(() => verifyAccessToken(tokens.accessToken)).toThrow();
    });
  });
});
