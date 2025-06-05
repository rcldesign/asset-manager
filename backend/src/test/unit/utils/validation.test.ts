import { describe, test, expect } from '@jest/globals';
import { commonSchemas, authSchemas, userSchemas, organizationSchemas } from '../../../middleware/validation';

describe('Validation Schemas', () => {
  describe('commonSchemas', () => {
    describe('email validation', () => {
      test('should validate correct email format', () => {
        const validEmails = [
          'user@example.com',
          'test.user+tag@example.co.uk',
          'user123@test-domain.org',
        ];

        validEmails.forEach(email => {
          const result = commonSchemas.email.safeParse(email);
          expect(result.success).toBe(true);
        });
      });

      test('should reject invalid email formats', () => {
        const invalidEmails = [
          'invalid-email',
          '@example.com',
          'user@',
          'user@.com',
          'user..name@example.com',
        ];

        invalidEmails.forEach(email => {
          const result = commonSchemas.email.safeParse(email);
          expect(result.success).toBe(false);
        });
      });

      test('should reject emails that are too long', () => {
        const longEmail = 'a'.repeat(250) + '@example.com';
        const result = commonSchemas.email.safeParse(longEmail);
        expect(result.success).toBe(false);
      });
    });

    describe('password validation', () => {
      test('should validate strong passwords', () => {
        const validPasswords = [
          'TestPassword123!',
          'MyStr0ng!Pass',
          'C0mplex&Secure9',
        ];

        validPasswords.forEach(password => {
          const result = commonSchemas.password.safeParse(password);
          expect(result.success).toBe(true);
        });
      });

      test('should reject weak passwords', () => {
        const weakPasswords = [
          '123', // Too short
          'password', // No uppercase, numbers, special chars
          'Password', // No numbers, special chars
          'Password123', // No special chars
          'Password!', // No numbers
          'password123!', // No uppercase
        ];

        weakPasswords.forEach(password => {
          const result = commonSchemas.password.safeParse(password);
          expect(result.success).toBe(false);
        });
      });

      test('should reject passwords that are too long', () => {
        const longPassword = 'A'.repeat(130) + '1!';
        const result = commonSchemas.password.safeParse(longPassword);
        expect(result.success).toBe(false);
      });
    });

    describe('UUID validation', () => {
      test('should validate correct UUID format', () => {
        const validUUIDs = [
          '123e4567-e89b-12d3-a456-426614174000',
          'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        ];

        validUUIDs.forEach(uuid => {
          const result = commonSchemas.id.safeParse(uuid);
          expect(result.success).toBe(true);
        });
      });

      test('should reject invalid UUID formats', () => {
        const invalidUUIDs = [
          '123',
          'not-a-uuid',
          '123e4567-e89b-12d3-a456',
          '123e4567-e89b-12d3-a456-426614174000-extra',
        ];

        invalidUUIDs.forEach(uuid => {
          const result = commonSchemas.id.safeParse(uuid);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('name validation', () => {
      test('should validate correct names', () => {
        const validNames = [
          'Test Name',
          'User123',
          'Project-Name',
          'File_Name.txt',
        ];

        validNames.forEach(name => {
          const result = commonSchemas.name.safeParse(name);
          expect(result.success).toBe(true);
        });
      });

      test('should reject names with invalid characters', () => {
        const invalidNames = [
          'Name<script>',
          'Name@#$%',
          'Name!@#',
          'Name&amp;',
        ];

        invalidNames.forEach(name => {
          const result = commonSchemas.name.safeParse(name);
          expect(result.success).toBe(false);
        });
      });

      test('should reject empty names', () => {
        const result = commonSchemas.name.safeParse('');
        expect(result.success).toBe(false);
      });
    });

    describe('TOTP token validation', () => {
      test('should validate correct TOTP tokens', () => {
        const validTokens = [
          '123456',
          '000000',
          '999999',
        ];

        validTokens.forEach(token => {
          const result = commonSchemas.totpToken.safeParse(token);
          expect(result.success).toBe(true);
        });
      });

      test('should reject invalid TOTP tokens', () => {
        const invalidTokens = [
          '12345', // Too short
          '1234567', // Too long
          'abcdef', // Not digits
          '12345a', // Mixed characters
        ];

        invalidTokens.forEach(token => {
          const result = commonSchemas.totpToken.safeParse(token);
          expect(result.success).toBe(false);
        });
      });
    });
  });

  describe('authSchemas', () => {
    describe('register schema', () => {
      test('should validate correct registration data', () => {
        const validData = {
          email: 'user@example.com',
          password: 'TestPassword123!',
          fullName: 'Test User',
          organizationName: 'Test Organization',
        };

        const result = authSchemas.register.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should validate registration without optional fields', () => {
        const validData = {
          email: 'user@example.com',
          password: 'TestPassword123!',
          organizationName: 'Test Organization',
        };

        const result = authSchemas.register.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject registration without required fields', () => {
        const invalidData = {
          email: 'user@example.com',
          // Missing password and organizationName
        };

        const result = authSchemas.register.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('login schema', () => {
      test('should validate correct login data', () => {
        const validData = {
          email: 'user@example.com',
          password: 'password123',
        };

        const result = authSchemas.login.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should validate login with TOTP token', () => {
        const validData = {
          email: 'user@example.com',
          password: 'password123',
          totpToken: '123456',
        };

        const result = authSchemas.login.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject login without required fields', () => {
        const invalidData = {
          email: 'user@example.com',
          // Missing password
        };

        const result = authSchemas.login.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('changePassword schema', () => {
      test('should validate correct password change data', () => {
        const validData = {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        };

        const result = authSchemas.changePassword.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject password change with weak new password', () => {
        const invalidData = {
          currentPassword: 'OldPassword123!',
          newPassword: '123', // Too weak
        };

        const result = authSchemas.changePassword.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('createApiToken schema', () => {
      test('should validate correct API token data', () => {
        const validData = {
          name: 'Test Token',
          expiresAt: new Date().toISOString(),
        };

        const result = authSchemas.createApiToken.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should validate API token without expiration', () => {
        const validData = {
          name: 'Permanent Token',
        };

        const result = authSchemas.createApiToken.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject API token with invalid name', () => {
        const invalidData = {
          name: 'Token<script>alert("xss")</script>',
        };

        const result = authSchemas.createApiToken.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('userSchemas', () => {
    describe('create schema', () => {
      test('should validate correct user creation data', () => {
        const validData = {
          email: 'user@example.com',
          password: 'TestPassword123!',
          fullName: 'Test User',
          role: 'MEMBER' as const,
        };

        const result = userSchemas.create.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should validate user creation without optional fields', () => {
        const validData = {
          email: 'user@example.com',
        };

        const result = userSchemas.create.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject user creation with invalid role', () => {
        const invalidData = {
          email: 'user@example.com',
          role: 'INVALID_ROLE',
        };

        const result = userSchemas.create.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('update schema', () => {
      test('should validate correct user update data', () => {
        const validData = {
          email: 'newemail@example.com',
          fullName: 'New Name',
          role: 'MANAGER' as const,
          isActive: false,
        };

        const result = userSchemas.update.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should validate empty update data', () => {
        const validData = {};

        const result = userSchemas.update.safeParse(validData);
        expect(result.success).toBe(true);
      });
    });

    describe('params schema', () => {
      test('should validate correct user params', () => {
        const validData = {
          userId: '123e4567-e89b-12d3-a456-426614174000',
        };

        const result = userSchemas.params.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject invalid user ID format', () => {
        const invalidData = {
          userId: 'invalid-id',
        };

        const result = userSchemas.params.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('organizationSchemas', () => {
    describe('update schema', () => {
      test('should validate correct organization update data', () => {
        const validData = {
          name: 'Updated Organization Name',
        };

        const result = organizationSchemas.update.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject organization update with invalid name', () => {
        const invalidData = {
          name: '', // Empty name
        };

        const result = organizationSchemas.update.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('setOwner schema', () => {
      test('should validate correct set owner data', () => {
        const validData = {
          userId: '123e4567-e89b-12d3-a456-426614174000',
        };

        const result = organizationSchemas.setOwner.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject invalid user ID', () => {
        const invalidData = {
          userId: 'invalid-id',
        };

        const result = organizationSchemas.setOwner.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });

    describe('params schema', () => {
      test('should validate correct organization params', () => {
        const validData = {
          organizationId: '123e4567-e89b-12d3-a456-426614174000',
        };

        const result = organizationSchemas.params.safeParse(validData);
        expect(result.success).toBe(true);
      });

      test('should reject invalid organization ID format', () => {
        const invalidData = {
          organizationId: 'invalid-id',
        };

        const result = organizationSchemas.params.safeParse(invalidData);
        expect(result.success).toBe(false);
      });
    });
  });
});