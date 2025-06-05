import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { generateTokens, verifyAccessToken, verifyRefreshToken, generateQRCode } from '../../../utils/auth';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { config } from '../../../config';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('qrcode');

const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockQRCode = QRCode as jest.Mocked<typeof QRCode>;

describe('Auth Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set test environment variables
    process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-long';
  });

  afterEach(() => {
    jest.resetAllMocks();
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

      mockJwt.sign
        .mockReturnValueOnce(mockAccessToken) // Access token
        .mockReturnValueOnce(mockRefreshToken); // Refresh token

      const result = generateTokens(payload);

      expect(mockJwt.sign).toHaveBeenCalledTimes(2);
      
      // Access token call
      expect(mockJwt.sign).toHaveBeenNthCalledWith(1,
        { ...payload, type: 'access' },
        config.jwt.accessSecret,
        { expiresIn: config.jwt.accessExpiry }
      );
      
      // Refresh token call
      expect(mockJwt.sign).toHaveBeenNthCalledWith(2,
        { ...payload, type: 'refresh' },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiry }
      );

      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
      });
    });

    test('should generate tokens with correct payload structure', () => {
      const payload = {
        userId: 'user-456',
        organizationId: 'org-456',
        role: 'OWNER' as const,
      };

      mockJwt.sign.mockReturnValue('mock-token');

      generateTokens(payload);

      // Verify access token payload includes all required fields
      const accessTokenCall = mockJwt.sign.mock.calls[0];
      expect(accessTokenCall[0]).toEqual({
        userId: payload.userId,
        organizationId: payload.organizationId,
        role: payload.role,
      });

      // Verify refresh token payload includes only userId
      const refreshTokenCall = mockJwt.sign.mock.calls[1];
      expect(refreshTokenCall[0]).toEqual({
        userId: payload.userId,
      });
    });
  });

  describe('verifyAccessToken', () => {
    test('should verify valid access token', () => {
      const token = 'valid-access-token';
      const expectedPayload = {
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      };

      mockJwt.verify.mockReturnValue(expectedPayload as any);

      const result = verifyAccessToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(token, config.jwt.accessSecret);
      expect(result).toEqual(expectedPayload);
    });

    test('should throw error for invalid token', () => {
      const token = 'invalid-token';
      const error = new Error('Invalid token');

      mockJwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => verifyAccessToken(token)).toThrow('Invalid token');
      expect(mockJwt.verify).toHaveBeenCalledWith(token, config.jwt.accessSecret);
    });

    test('should throw error for expired token', () => {
      const token = 'expired-token';
      const error = new Error('Token expired');
      (error as any).name = 'TokenExpiredError';

      mockJwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => verifyAccessToken(token)).toThrow('Token expired');
    });

    test('should throw error for malformed token', () => {
      const token = 'malformed-token';
      const error = new Error('Malformed token');
      (error as any).name = 'JsonWebTokenError';

      mockJwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => verifyAccessToken(token)).toThrow('Malformed token');
    });
  });

  describe('verifyRefreshToken', () => {
    test('should verify valid refresh token', () => {
      const token = 'valid-refresh-token';
      const expectedPayload = {
        userId: 'user-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 604800, // 7 days
      };

      mockJwt.verify.mockReturnValue(expectedPayload as any);

      const result = verifyRefreshToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(token, config.jwt.refreshSecret);
      expect(result).toEqual(expectedPayload);
    });

    test('should throw error for invalid refresh token', () => {
      const token = 'invalid-refresh-token';
      const error = new Error('Invalid refresh token');

      mockJwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => verifyRefreshToken(token)).toThrow('Invalid refresh token');
      expect(mockJwt.verify).toHaveBeenCalledWith(token, config.jwt.refreshSecret);
    });

    test('should use correct secret for refresh token verification', () => {
      const token = 'test-token';
      
      mockJwt.verify.mockReturnValue({ userId: 'user-123' } as any);

      verifyRefreshToken(token);

      expect(mockJwt.verify).toHaveBeenCalledWith(token, config.jwt.refreshSecret);
      // Ensure it's not using the access token secret
      expect(mockJwt.verify).not.toHaveBeenCalledWith(token, config.jwt.accessSecret);
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
      const otpauthUrl = 'otpauth://totp/My%20App%3Auser%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=My%20App';
      const dataUrl = 'data:image/png;base64,mockdata';

      mockQRCode.toDataURL.mockResolvedValue(dataUrl);

      const result = await generateQRCode(otpauthUrl);

      expect(result).toBe(dataUrl);
      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(otpauthUrl, expect.any(Object));
    });
  });

  describe('Token integration', () => {
    test('should generate and verify tokens end-to-end', () => {
      // Use real JWT for integration test
      jest.restoreAllMocks();

      const payload = {
        userId: 'user-123',
        organizationId: 'org-123',
        role: 'MEMBER' as const,
      };

      const tokens = generateTokens(payload);

      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');

      // Verify tokens can be decoded
      const accessPayload = verifyAccessToken(tokens.accessToken);
      const refreshPayload = verifyRefreshToken(tokens.refreshToken);

      expect(accessPayload.userId).toBe(payload.userId);
      expect(accessPayload.organizationId).toBe(payload.organizationId);
      expect(accessPayload.role).toBe(payload.role);

      expect(refreshPayload.userId).toBe(payload.userId);
      expect(refreshPayload).not.toHaveProperty('organizationId');
      expect(refreshPayload).not.toHaveProperty('role');
    });

    test('should reject tokens signed with wrong secret', () => {
      jest.restoreAllMocks();

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