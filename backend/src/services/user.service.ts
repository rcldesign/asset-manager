import type { User, UserRole, Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errors';
import { generateSecureToken } from '../utils/crypto';
import { generateTOTPSecret, verifyTOTPToken } from '../utils/auth';
import { permissionManager, type PermissionContext, filterAttributes } from '../lib/permissions';

export interface CreateUserData {
  email: string;
  password?: string;
  fullName?: string;
  organizationId: string;
  role?: UserRole;
  emailVerified?: boolean;
}

export interface UpdateUserData {
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
  totpEnabled?: boolean;
}

/**
 * Service for managing users with authentication and authorization.
 * Provides user CRUD operations, authentication, 2FA, and API token management.
 * Integrates with permission system for fine-grained access control.
 *
 * @class UserService
 */
export class UserService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }
  /**
   * Create a new user in an organization.
   * Validates email uniqueness and organization existence.
   *
   * @param {CreateUserData} data - User creation data
   * @returns {Promise<User>} The created user with organization
   * @throws {AppError} If email already exists (409) or organization not found (404)
   *
   * @example
   * const user = await userService.createUser({
   *   email: 'john@example.com',
   *   password: 'SecurePass123!',
   *   fullName: 'John Doe',
   *   organizationId: 'org-123',
   *   role: 'member'
   * });
   */
  async createUser(data: CreateUserData): Promise<User> {
    const { email, password, organizationId, ...userData } = data;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    // Verify organization exists
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    // Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        organizationId,
        ...userData,
      },
      include: {
        organization: true,
      },
    });

    return user;
  }

  /**
   * Find user by ID.
   * Includes organization data for context.
   *
   * @param {string} id - User ID
   * @returns {Promise<User | null>} User with organization or null
   *
   * @example
   * const user = await userService.getUserById('user-123');
   */
  async getUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        organization: true,
      },
    });
  }

  /**
   * Find user by email address.
   * Email search is case-insensitive.
   *
   * @param {string} email - Email address
   * @returns {Promise<User | null>} User with organization or null
   *
   * @example
   * const user = await userService.findByEmail('john@example.com');
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        organization: true,
      },
    });
  }

  /**
   * Find all users in an organization with permission filtering.
   * Applies attribute-based access control based on requester permissions.
   *
   * @param {string} organizationId - Organization ID
   * @param {PermissionContext} [requesterContext] - Requester's permission context
   * @param {Object} [options] - Query options
   * @param {number} [options.skip] - Number of records to skip
   * @param {number} [options.take] - Number of records to take
   * @param {UserRole} [options.role] - Filter by role
   * @param {boolean} [options.isActive] - Filter by active status
   * @returns {Promise<Object>} Users array (potentially filtered) and total count
   * @throws {AppError} If insufficient permissions (403)
   *
   * @example
   * const { users, total } = await userService.findByOrganization(
   *   'org-123',
   *   requesterContext,
   *   { role: 'member', isActive: true, skip: 0, take: 20 }
   * );
   */
  async findByOrganization(
    organizationId: string,
    requesterContext?: PermissionContext,
    options?: {
      skip?: number;
      take?: number;
      role?: UserRole;
      isActive?: boolean;
    },
  ): Promise<{ users: Partial<User>[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(options?.role && { role: options.role }),
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Apply permission-based attribute filtering if context provided
    if (requesterContext) {
      const permissionResult = permissionManager.can(requesterContext, 'read', 'user', 'any');
      if (!permissionResult.granted) {
        throw new AppError('Insufficient permissions to read users', 403);
      }

      const filteredUsers = users.map((user) =>
        filterAttributes(user as Record<string, unknown>, permissionResult.attributes),
      );

      return { users: filteredUsers as Partial<User>[], total };
    }

    return { users, total };
  }

  /**
   * Update user with permission checks.
   * Filters update data based on requester's allowed attributes.
   *
   * @param {string} id - User ID to update
   * @param {UpdateUserData} data - Update data
   * @param {PermissionContext} [requesterContext] - Requester's permission context
   * @returns {Promise<User>} Updated user
   * @throws {AppError} If user not found (404), email taken (409), or insufficient permissions (403)
   *
   * @example
   * const updated = await userService.updateUser(
   *   'user-123',
   *   { fullName: 'Jane Doe', role: 'admin' },
   *   requesterContext
   * );
   */
  async updateUser(
    id: string,
    data: UpdateUserData,
    requesterContext?: PermissionContext,
  ): Promise<User> {
    // Permission check if context provided
    if (requesterContext) {
      const targetUser = await this.getUserById(id);
      if (!targetUser) {
        throw new AppError('User not found', 404);
      }

      const context = {
        ...requesterContext,
        resourceOwnerId: targetUser.id,
        resourceOrganizationId: targetUser.organizationId,
      };

      const scope = targetUser.id === requesterContext.userId ? 'own' : 'any';
      const permissionResult = permissionManager.can(context, 'update', 'user', scope);

      if (!permissionResult.granted) {
        throw new AppError('Insufficient permissions to update user', 403);
      }

      // Filter the update data based on allowed attributes
      const filteredData = filterAttributes(
        data as Record<string, unknown>,
        permissionResult.attributes,
      ) as UpdateUserData;
      data = filteredData;
    }

    // Check if email is being changed and if it's already taken
    if (data.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase(),
          NOT: { id },
        },
      });

      if (existingUser) {
        throw new AppError('Email is already in use', 409);
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(data.email && { email: data.email.toLowerCase() }),
      },
      include: {
        organization: true,
      },
    });

    return user;
  }

  /**
   * Change user password.
   * Convenience method that delegates to updatePassword.
   *
   * @param {string} userId - User ID
   * @param {Object} data - Password change data
   * @param {string} data.currentPassword - Current password for verification
   * @param {string} data.newPassword - New password to set
   * @returns {Promise<void>}
   * @throws {AppError} If validation fails
   *
   * @example
   * await userService.changePassword('user-123', {
   *   currentPassword: 'OldPass123!',
   *   newPassword: 'NewPass456!'
   * });
   */
  async changePassword(
    userId: string,
    data: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    return this.updatePassword(userId, data.currentPassword, data.newPassword);
  }

  /**
   * Update user password with current password verification.
   *
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password to set
   * @returns {Promise<void>}
   * @throws {AppError} If user not found (404), no password set (400), or current password incorrect (400)
   */
  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.passwordHash) {
      throw new AppError('User does not have a password set', 400);
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });
  }

  /**
   * Authenticate user with email and password.
   * Supports two-factor authentication if enabled.
   *
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} [totpToken] - TOTP token for 2FA
   * @param {number} [timeForTesting] - Override time for TOTP testing
   * @returns {Promise<Object | null>} User and 2FA status or null if authentication fails
   * @throws {AppError} If 2FA enabled but secret missing (500)
   *
   * @example
   * // Initial authentication
   * const result = await userService.authenticateUser('john@example.com', 'password');
   * if (result?.requiresTwoFactor) {
   *   // Prompt for 2FA token
   * }
   *
   * // With 2FA token
   * const result = await userService.authenticateUser(
   *   'john@example.com',
   *   'password',
   *   '123456'
   * );
   */
  async authenticateUser(
    email: string,
    password: string,
    totpToken?: string,
    timeForTesting?: number,
  ): Promise<{ user: User; requiresTwoFactor: boolean } | null> {
    const user = await this.verifyPassword(email, password);
    if (!user) {
      return null;
    }

    // If user has 2FA enabled, verify TOTP token
    if (user.totpEnabled) {
      if (!totpToken) {
        return { user, requiresTwoFactor: true };
      }

      // Verify the TOTP token
      if (!user.totpSecret) {
        throw new AppError('2FA is enabled but no secret found. Please contact support.', 500);
      }

      const isValidToken = verifyTOTPToken(totpToken, user.totpSecret, timeForTesting);
      if (!isValidToken) {
        return null; // Invalid 2FA token - authentication fails
      }
    }

    return { user, requiresTwoFactor: false };
  }

  /**
   * Verify user password without 2FA.
   * Returns user only if password is valid and account is active.
   *
   * @param {string} email - User email
   * @param {string} password - Password to verify
   * @returns {Promise<User | null>} User if valid, null otherwise
   * @private
   */
  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        organization: true,
      },
    });

    if (!user || !user.passwordHash || !user.isActive) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  /**
   * Delete user (soft delete by deactivating) with permission checks.
   * User data is retained but account is deactivated.
   *
   * @param {string} id - User ID to delete
   * @param {PermissionContext} [requesterContext] - Requester's permission context
   * @returns {Promise<void>}
   * @throws {AppError} If user not found (404) or insufficient permissions (403)
   *
   * @example
   * await userService.deleteUser('user-123', requesterContext);
   */
  async deleteUser(id: string, requesterContext?: PermissionContext): Promise<void> {
    // Permission check if context provided
    if (requesterContext) {
      const targetUser = await this.getUserById(id);
      if (!targetUser) {
        throw new AppError('User not found', 404);
      }

      const context = {
        ...requesterContext,
        resourceOwnerId: targetUser.id,
        resourceOrganizationId: targetUser.organizationId,
      };

      const permissionResult = permissionManager.can(context, 'delete', 'user', 'any');

      if (!permissionResult.granted) {
        throw new AppError('Insufficient permissions to delete user', 403);
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Setup two-factor authentication for a user.
   * Generates TOTP secret and QR code for authenticator apps.
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} TOTP setup data
   * @returns {string} returns.secret - Base32 encoded secret
   * @returns {string} returns.qrCodeUrl - QR code URL for authenticator apps
   * @returns {string} returns.manualEntryKey - Formatted key for manual entry
   * @throws {AppError} If user not found (404)
   *
   * @example
   * const { qrCodeUrl, manualEntryKey } = await userService.setupTwoFactor('user-123');
   * // Display QR code to user for scanning
   */
  async setupTwoFactor(userId: string): Promise<{
    secret: string;
    qrCodeUrl: string;
    manualEntryKey: string;
  }> {
    // Get the user to include their email in the TOTP secret
    const user = await this.getUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Generate TOTP secret
    const totpSecret = generateTOTPSecret(user.email, 'DumbAssets Enhanced');

    // Store the temporary secret in the database (not yet enabled)
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: totpSecret.secret },
    });

    return {
      secret: totpSecret.secret,
      qrCodeUrl: totpSecret.qrCodeUrl,
      manualEntryKey: totpSecret.manualEntryKey,
    };
  }

  /**
   * Enable two-factor authentication after setup.
   * Verifies TOTP token before enabling 2FA.
   *
   * @param {string} userId - User ID
   * @param {string} totpToken - TOTP token to verify
   * @param {number} [timeForTesting] - Override time for TOTP testing
   * @returns {Promise<void>}
   * @throws {AppError} If user not found (404), no secret (400), or invalid token (400)
   *
   * @example
   * await userService.enableTwoFactor('user-123', '123456');
   */
  async enableTwoFactor(userId: string, totpToken: string, timeForTesting?: number): Promise<void> {
    // Get the user and their temporary TOTP secret
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.totpSecret) {
      throw new AppError('No TOTP secret found. Please set up 2FA first.', 400);
    }

    // Verify the provided TOTP token
    const isValidToken = verifyTOTPToken(totpToken, user.totpSecret, timeForTesting);
    if (!isValidToken) {
      throw new AppError('Invalid TOTP token', 400);
    }

    // Enable 2FA for the user
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
  }

  /**
   * Disable two-factor authentication.
   * Requires valid TOTP token for security.
   *
   * @param {string} userId - User ID
   * @param {string} totpToken - TOTP token for verification
   * @param {number} [timeForTesting] - Override time for TOTP testing
   * @returns {Promise<void>}
   * @throws {AppError} If user not found (404), 2FA not enabled (400), or invalid token (400)
   *
   * @example
   * await userService.disableTwoFactor('user-123', '123456');
   */
  async disableTwoFactor(
    userId: string,
    totpToken: string,
    timeForTesting?: number,
  ): Promise<void> {
    // Get the user and their TOTP secret
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.totpEnabled || !user.totpSecret) {
      throw new AppError('2FA is not enabled for this user', 400);
    }

    // Verify the provided TOTP token
    const isValidToken = verifyTOTPToken(totpToken, user.totpSecret, timeForTesting);
    if (!isValidToken) {
      throw new AppError('Invalid TOTP token', 400);
    }

    // Disable 2FA and remove the secret
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecret: null, // Remove the secret for security
      },
    });
  }

  /**
   * Verify user email address.
   * Marks email as verified in the system.
   *
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   *
   * @example
   * await userService.verifyEmail('user-123');
   */
  async verifyEmail(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  /**
   * Create API token for user with permission checks.
   * Generates secure token with SHA-256 hashing.
   *
   * @param {string} userId - User ID
   * @param {Object} data - Token creation data
   * @param {string} data.name - Token name/description
   * @param {Date} [data.expiresAt] - Optional expiration date
   * @param {PermissionContext} [requesterContext] - Requester's permission context
   * @returns {Promise<Object>} Created token details (token shown only once)
   * @throws {AppError} If insufficient permissions (403)
   *
   * @example
   * const { token, id } = await userService.createApiToken(
   *   'user-123',
   *   { name: 'CI/CD Token', expiresAt: new Date('2025-01-01') },
   *   requesterContext
   * );
   * // Save the token securely - it cannot be retrieved again
   */
  async createApiToken(
    userId: string,
    data: { name: string; expiresAt?: Date },
    requesterContext?: PermissionContext,
  ): Promise<{ token: string; id: string; name: string; expiresAt?: Date; createdAt: Date }> {
    // Permission check if context provided
    if (requesterContext) {
      const context = {
        ...requesterContext,
        resourceOwnerId: userId,
      };

      const scope = userId === requesterContext.userId ? 'own' : 'any';
      const permissionResult = permissionManager.can(context, 'create', 'api-token', scope);

      if (!permissionResult.granted) {
        throw new AppError('Insufficient permissions to create API token', 403);
      }
    }

    const token = generateSecureToken(32);
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 8);

    const apiToken = await this.prisma.apiToken.create({
      data: {
        userId,
        name: data.name,
        token: hashedToken,
        tokenPrefix,
        expiresAt: data.expiresAt,
      },
    });

    return {
      token,
      id: apiToken.id,
      name: data.name,
      expiresAt: data.expiresAt,
      createdAt: apiToken.createdAt,
    };
  }

  /**
   * Generate API token for user without permission checks.
   * Legacy method - prefer createApiToken for new code.
   *
   * @param {string} userId - User ID
   * @param {string} name - Token name
   * @param {Date} [expiresAt] - Optional expiration
   * @returns {Promise<string>} The generated token
   * @deprecated Use createApiToken instead
   */
  async generateApiToken(userId: string, name: string, expiresAt?: Date): Promise<string> {
    const token = generateSecureToken(32);
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 8);

    await this.prisma.apiToken.create({
      data: {
        userId,
        name,
        token: hashedToken,
        tokenPrefix,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Validate API token and return associated user.
   * Supports both new SHA-256 and legacy bcrypt tokens.
   * Updates last used timestamp on successful validation.
   *
   * @param {string} token - API token to validate
   * @returns {Promise<User | null>} User if token valid and not expired, null otherwise
   *
   * @example
   * const user = await userService.validateApiToken('sk_live_abc123...');
   * if (user) {
   *   // Token is valid, proceed with authenticated request
   * }
   */
  async validateApiToken(token: string): Promise<User | null> {
    const hashedToken = createHash('sha256').update(token).digest('hex');

    // First try SHA-256 hash (new method)
    let apiToken = await this.prisma.apiToken.findFirst({
      where: {
        token: hashedToken,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });

    // If not found, try bcrypt comparison (legacy method for backward compatibility)
    if (!apiToken) {
      const tokenPrefix = token.substring(0, 8);

      // First try to find tokens with matching prefix (performance optimization)
      let candidateTokens = await this.prisma.apiToken.findMany({
        where: {
          tokenPrefix,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          user: {
            include: {
              organization: true,
            },
          },
        },
      });

      // If no prefix matches found, fall back to all active tokens (for tokens without prefix)
      if (candidateTokens.length === 0) {
        candidateTokens = await this.prisma.apiToken.findMany({
          where: {
            tokenPrefix: null, // Only check legacy tokens without prefix
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            user: {
              include: {
                organization: true,
              },
            },
          },
        });
      }

      // Check each candidate token with bcrypt (legacy tokens)
      for (const dbToken of candidateTokens) {
        try {
          const isValid = await bcrypt.compare(token, dbToken.token);
          if (isValid) {
            apiToken = dbToken;
            // Automatically migrate legacy tokens to new format
            await this.prisma.apiToken.update({
              where: { id: dbToken.id },
              data: {
                token: hashedToken,
                tokenPrefix: tokenPrefix,
              },
            });
            break;
          }
        } catch {
          // Skip invalid bcrypt hashes
          continue;
        }
      }
    }

    if (!apiToken || !apiToken.user || !apiToken.user.isActive) {
      return null;
    }

    // Update last used timestamp
    await this.prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsed: new Date() },
    });

    return apiToken.user;
  }

  /**
   * Revoke API token with permission checks.
   * Permanently deletes the token.
   *
   * @param {string} userId - User ID who owns the token
   * @param {string} tokenId - Token ID to revoke
   * @param {PermissionContext} [requesterContext] - Requester's permission context
   * @returns {Promise<void>}
   * @throws {AppError} If token not found (400) or insufficient permissions (403)
   *
   * @example
   * await userService.revokeApiToken('user-123', 'token-456', requesterContext);
   */
  async revokeApiToken(
    userId: string,
    tokenId: string,
    requesterContext?: PermissionContext,
  ): Promise<void> {
    // Permission check if context provided
    if (requesterContext) {
      const context = {
        ...requesterContext,
        resourceOwnerId: userId,
      };

      const scope = userId === requesterContext.userId ? 'own' : 'any';
      const permissionResult = permissionManager.can(context, 'delete', 'api-token', scope);

      if (!permissionResult.granted) {
        throw new AppError('Insufficient permissions to revoke API token', 403);
      }
    }

    // First check if the token exists and belongs to the user
    const existingToken = await this.prisma.apiToken.findUnique({
      where: {
        id: tokenId,
      },
    });

    if (!existingToken || existingToken.userId !== userId) {
      throw new AppError('API token not found', 400);
    }

    // Now delete the specific token
    await this.prisma.apiToken.delete({
      where: {
        id: tokenId,
      },
    });
  }

  /**
   * List user's API tokens with permission checks.
   * Returns metadata only - actual tokens are never shown.
   *
   * @param {string} userId - User ID
   * @param {PermissionContext} [requesterContext] - Requester's permission context
   * @returns {Promise<Array>} Array of token metadata
   * @throws {AppError} If insufficient permissions (403)
   *
   * @example
   * const tokens = await userService.listApiTokens('user-123', requesterContext);
   * tokens.forEach(token => {
   *   console.log(`${token.name}: last used ${token.lastUsed}`);
   * });
   */
  async listApiTokens(
    userId: string,
    requesterContext?: PermissionContext,
  ): Promise<
    Array<{
      id: string;
      name: string;
      lastUsed: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
    }>
  > {
    // Permission check if context provided
    if (requesterContext) {
      const context = {
        ...requesterContext,
        resourceOwnerId: userId,
      };

      const scope = userId === requesterContext.userId ? 'own' : 'any';
      const permissionResult = permissionManager.can(context, 'read', 'api-token', scope);

      if (!permissionResult.granted) {
        throw new AppError('Insufficient permissions to read API tokens', 403);
      }
    }

    const tokens = await this.prisma.apiToken.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return tokens;
  }

  /**
   * Get filtered user data based on permissions.
   * Returns only attributes the requester is allowed to see.
   *
   * @param {string} id - User ID to retrieve
   * @param {PermissionContext} requesterContext - Requester's permission context
   * @returns {Promise<Partial<User> | null>} Filtered user data or null
   * @throws {AppError} If insufficient permissions (403)
   *
   * @example
   * const userData = await userService.getUserWithPermissions(
   *   'user-123',
   *   requesterContext
   * );
   * // May return limited fields based on permissions
   */
  async getUserWithPermissions(
    id: string,
    requesterContext: PermissionContext,
  ): Promise<Partial<User> | null> {
    const user = await this.getUserById(id);
    if (!user) {
      return null;
    }

    const context = {
      ...requesterContext,
      resourceOwnerId: user.id,
      resourceOrganizationId: user.organizationId,
    };

    const scope = user.id === requesterContext.userId ? 'own' : 'any';
    const permissionResult = permissionManager.can(context, 'read', 'user', scope);

    if (!permissionResult.granted) {
      throw new AppError('Insufficient permissions to read user', 403);
    }

    return filterAttributes(
      user as Record<string, unknown>,
      permissionResult.attributes,
    ) as Partial<User>;
  }

  /**
   * Check if user can perform action on another user.
   * Useful for pre-validation before attempting operations.
   *
   * @param {PermissionContext} requesterContext - Requester's permission context
   * @param {string} targetUserId - Target user ID
   * @param {'read' | 'update' | 'delete'} action - Action to check
   * @returns {Promise<boolean>} True if action is allowed
   *
   * @example
   * const canEdit = await userService.canPerformAction(
   *   requesterContext,
   *   'user-456',
   *   'update'
   * );
   * if (!canEdit) {
   *   throw new Error('Cannot edit this user');
   * }
   */
  async canPerformAction(
    requesterContext: PermissionContext,
    targetUserId: string,
    action: 'read' | 'update' | 'delete',
  ): Promise<boolean> {
    const targetUser = await this.getUserById(targetUserId);
    if (!targetUser) {
      return false;
    }

    const context = {
      ...requesterContext,
      resourceOwnerId: targetUser.id,
      resourceOrganizationId: targetUser.organizationId,
    };

    const scope = targetUser.id === requesterContext.userId ? 'own' : 'any';
    const permissionResult = permissionManager.can(context, action, 'user', scope);

    return permissionResult.granted;
  }
}
