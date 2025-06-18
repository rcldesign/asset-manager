import type { User, UserRole, Prisma } from '@prisma/client';
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

export class UserService {
  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<User> {
    const { email, password, organizationId, ...userData } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
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
    const user = await prisma.user.create({
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
   * Find user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
      include: {
        organization: true,
      },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        organization: true,
      },
    });
  }

  /**
   * Find all users in an organization with permission filtering
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
      prisma.user.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
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
   * Update user with permission checks
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
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase(),
          NOT: { id },
        },
      });

      if (existingUser) {
        throw new AppError('Email is already in use', 409);
      }
    }

    const user = await prisma.user.update({
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
   * Change user password
   */
  async changePassword(
    userId: string,
    data: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    return this.updatePassword(userId, data.currentPassword, data.newPassword);
  }

  /**
   * Update user password
   */
  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
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
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });
  }

  /**
   * Authenticate user with email and password
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
   * Verify user password
   */
  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
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
   * Delete user (soft delete by deactivating) with permission checks
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

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Setup two-factor authentication
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
    await prisma.user.update({
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
   * Enable two-factor authentication
   */
  async enableTwoFactor(userId: string, totpToken: string, timeForTesting?: number): Promise<void> {
    // Get the user and their temporary TOTP secret
    const user = await prisma.user.findUnique({
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
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(
    userId: string,
    totpToken: string,
    timeForTesting?: number,
  ): Promise<void> {
    // Get the user and their TOTP secret
    const user = await prisma.user.findUnique({
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
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecret: null, // Remove the secret for security
      },
    });
  }

  /**
   * Verify user email
   */
  async verifyEmail(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  /**
   * Create API token for user with permission checks
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

    const apiToken = await prisma.apiToken.create({
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
   * Generate API token for user
   */
  async generateApiToken(userId: string, name: string, expiresAt?: Date): Promise<string> {
    const token = generateSecureToken(32);
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 8);

    await prisma.apiToken.create({
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
   * Validate API token
   */
  async validateApiToken(token: string): Promise<User | null> {
    const hashedToken = createHash('sha256').update(token).digest('hex');

    // First try SHA-256 hash (new method)
    let apiToken = await prisma.apiToken.findFirst({
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
      let candidateTokens = await prisma.apiToken.findMany({
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
        candidateTokens = await prisma.apiToken.findMany({
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
            await prisma.apiToken.update({
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
    await prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsed: new Date() },
    });

    return apiToken.user;
  }

  /**
   * Revoke API token with permission checks
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
    const existingToken = await prisma.apiToken.findUnique({
      where: {
        id: tokenId,
      },
    });

    if (!existingToken || existingToken.userId !== userId) {
      throw new AppError('API token not found', 400);
    }

    // Now delete the specific token
    await prisma.apiToken.delete({
      where: {
        id: tokenId,
      },
    });
  }

  /**
   * List user's API tokens with permission checks
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

    const tokens = await prisma.apiToken.findMany({
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
   * Get filtered user data based on permissions
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
   * Check if user can perform action on another user
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
