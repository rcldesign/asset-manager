import type { PrismaClient, UserInvitation, UserRole, User } from '@prisma/client';
import { InvitationStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { addDays } from 'date-fns';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import { NotificationService } from './notification.service';
import { ActivityStreamService } from './activity-stream.service';
import { EmailService } from './email.service';

interface InvitationCreateInput {
  organizationId: string;
  email: string;
  role: UserRole;
  invitedByUserId: string;
  customMessage?: string;
}

interface MentionParseResult {
  content: string;
  mentionedUsernames: string[];
  mentionedUserIds: string[];
}

export class CollaborationService {
  private notificationService: NotificationService;
  private activityStreamService: ActivityStreamService;
  private emailService: EmailService;

  constructor(private prisma: PrismaClient) {
    this.notificationService = new NotificationService(prisma);
    this.activityStreamService = new ActivityStreamService(prisma);
    this.emailService = new EmailService();
  }

  /**
   * Create and send a user invitation
   */
  async createInvitation(input: InvitationCreateInput): Promise<UserInvitation> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Check for existing pending invitation
    const existingInvitation = await this.prisma.userInvitation.findFirst({
      where: {
        email: input.email,
        organizationId: input.organizationId,
        status: InvitationStatus.PENDING,
      },
    });

    if (existingInvitation) {
      throw new ValidationError('An invitation for this email is already pending');
    }

    // Generate invitation token
    const token = randomBytes(32).toString('hex');
    const expiresAt = addDays(new Date(), 7); // 7 days expiry

    // Create invitation
    const invitation = await this.prisma.userInvitation.create({
      data: {
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        invitedByUserId: input.invitedByUserId,
        token,
        expiresAt,
      },
      include: {
        invitedBy: true,
        organization: true,
      },
    });

    // Send invitation email
    await this.emailService.sendInvitationEmail({
      to: input.email,
      inviterName: invitation.invitedBy.fullName || invitation.invitedBy.email,
      organizationName: invitation.organization.name,
      invitationToken: token,
      customMessage: input.customMessage,
      expiresAt,
    });

    // Log activity
    await this.activityStreamService.emitActivity({
      organizationId: input.organizationId,
      actor: {
        type: 'User',
        id: input.invitedByUserId,
        name: 'User', // We'd need to fetch the actual user name
      },
      verb: 'invited',
      object: {
        type: 'Invitation',
        id: invitation.id,
        displayName: input.email,
      },
      metadata: {
        invitedEmail: input.email,
        role: input.role,
      },
    });

    logger.info('User invitation created', {
      invitationId: invitation.id,
      email: input.email,
      organizationId: input.organizationId,
    });

    return invitation;
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(
    token: string,
    userData: {
      fullName: string;
      password: string;
    },
  ): Promise<User> {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token },
      include: {
        organization: true,
      },
    });

    if (!invitation) {
      throw new NotFoundError('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ValidationError('Invitation has already been used');
    }

    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await this.prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new ValidationError('Invitation has expired');
    }

    // Create user account
    const user = await this.prisma.user.create({
      data: {
        email: invitation.email,
        fullName: userData.fullName,
        passwordHash: userData.password, // Assumes password is already hashed
        role: invitation.role,
        organizationId: invitation.organizationId,
        emailVerified: true, // Since they received the invitation email
      },
    });

    // Update invitation status
    await this.prisma.userInvitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });

    // Send welcome notification
    await this.notificationService.createNotification({
      organizationId: invitation.organizationId,
      userId: user.id,
      type: 'invitation',
      title: 'Welcome to the team!',
      message: `You've successfully joined ${invitation.organization.name}`,
      sendInApp: true,
    });

    // Log activity
    await this.activityStreamService.emitActivity({
      organizationId: invitation.organizationId,
      actor: {
        type: 'User',
        id: user.id,
        name: user.fullName || user.email,
      },
      verb: 'activated',
      object: {
        type: 'User',
        id: user.id,
        displayName: user.fullName || user.email,
      },
      metadata: {
        joinedViaInvitation: true,
        invitationId: invitation.id,
      },
    });

    return user;
  }

  /**
   * Cancel an invitation
   */
  async cancelInvitation(
    invitationId: string,
    organizationId: string,
    cancelledBy: string,
  ): Promise<void> {
    const invitation = await this.prisma.userInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
        status: InvitationStatus.PENDING,
      },
    });

    if (!invitation) {
      throw new NotFoundError('Invitation not found or already processed');
    }

    await this.prisma.userInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.CANCELLED },
    });

    logger.info('Invitation cancelled', {
      invitationId,
      cancelledBy,
    });
  }

  /**
   * List invitations for an organization
   */
  async listInvitations(
    organizationId: string,
    options: {
      status?: InvitationStatus;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    data: UserInvitation[];
    meta: {
      total: number;
      page: number;
      lastPage: number;
    };
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      organizationId,
    };

    if (options.status) {
      whereClause.status = options.status;
    }

    const [invitations, total] = await Promise.all([
      this.prisma.userInvitation.findMany({
        where: whereClause,
        include: {
          invitedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.userInvitation.count({ where: whereClause }),
    ]);

    return {
      data: invitations,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Parse mentions in text content
   */
  async parseMentions(content: string, organizationId: string): Promise<MentionParseResult> {
    // Find all @mentions in the content
    const mentionRegex = /@(\w+)/g;
    const matches = content.match(mentionRegex) || [];
    const mentionedUsernames = matches.map((m) => m.substring(1)); // Remove @ symbol

    if (mentionedUsernames.length === 0) {
      return {
        content,
        mentionedUsernames: [],
        mentionedUserIds: [],
      };
    }

    // Find users by username (email prefix) or fullName
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        OR: mentionedUsernames.flatMap((username) => [
          {
            email: {
              startsWith: username,
            },
          },
          {
            fullName: {
              contains: username,
              mode: 'insensitive' as const,
            },
          },
        ]),
      },
    });

    // Create a map of username to user ID
    const usernameToUserId = new Map<string, string>();
    users.forEach((user) => {
      const emailPrefix = user.email.split('@')[0];
      const nameParts = (user.fullName || '').toLowerCase().split(' ');

      mentionedUsernames.forEach((username) => {
        if (emailPrefix === username || nameParts.includes(username.toLowerCase())) {
          usernameToUserId.set(username, user.id);
        }
      });
    });

    const mentionedUserIds = Array.from(usernameToUserId.values());

    return {
      content,
      mentionedUsernames,
      mentionedUserIds,
    };
  }

  /**
   * Create mentions from a comment
   */
  async createMentionsFromComment(
    commentId: string,
    content: string,
    organizationId: string,
    mentionedBy: string,
  ): Promise<void> {
    const { mentionedUserIds } = await this.parseMentions(content, organizationId);

    if (mentionedUserIds.length === 0) {
      return;
    }

    // Get comment details
    const comment = await this.prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: true,
      },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Create mention records
    await this.prisma.mention.createMany({
      data: mentionedUserIds.map((userId) => ({
        commentId,
        mentionedUserId: userId,
      })),
    });

    // Send notifications to mentioned users
    for (const userId of mentionedUserIds) {
      if (userId !== mentionedBy) {
        await this.notificationService.createNotification({
          organizationId,
          userId,
          taskId: comment.taskId,
          type: 'mention',
          title: 'You were mentioned',
          message: `You were mentioned in a comment on task "${comment.task.title}"`,
          sendInApp: true,
          sendEmail: true,
          data: {
            commentId,
            mentionedBy,
          },
        });
      }
    }

    // Log activity
    await this.activityStreamService.emitActivity({
      organizationId,
      actor: {
        type: 'User',
        id: mentionedBy,
        name: 'User', // We'd need to fetch the actual user name
      },
      verb: 'mentioned',
      object: {
        type: 'Comment',
        id: commentId,
        displayName: 'Comment',
      },
      metadata: {
        mentionedUsers: mentionedUserIds,
        taskId: comment.taskId,
      },
    });
  }

  /**
   * Get users available for mention
   */
  async getMentionableUsers(
    organizationId: string,
    search?: string,
  ): Promise<
    Array<{
      id: string;
      username: string;
      displayName: string;
      email: string;
    }>
  > {
    const whereClause: any = {
      organizationId,
      isActive: true,
    };

    if (search) {
      whereClause.OR = [
        {
          email: {
            contains: search,
            mode: 'insensitive' as const,
          },
        },
        {
          fullName: {
            contains: search,
            mode: 'insensitive' as const,
          },
        },
      ];
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        fullName: true,
      },
      take: 10, // Limit suggestions
    });

    return users.map((user) => ({
      id: user.id,
      username: user.email.split('@')[0] || '',
      displayName: user.fullName || user.email,
      email: user.email,
    }));
  }

  /**
   * Resend invitation email
   */
  async resendInvitation(invitationId: string, organizationId: string): Promise<void> {
    const invitation = await this.prisma.userInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
        status: InvitationStatus.PENDING,
      },
      include: {
        invitedBy: true,
        organization: true,
      },
    });

    if (!invitation) {
      throw new NotFoundError('Invitation not found or already processed');
    }

    if (invitation.expiresAt < new Date()) {
      throw new ValidationError('Invitation has expired');
    }

    // Resend email
    await this.emailService.sendInvitationEmail({
      to: invitation.email,
      inviterName: invitation.invitedBy.fullName || invitation.invitedBy.email,
      organizationName: invitation.organization.name,
      invitationToken: invitation.token,
      expiresAt: invitation.expiresAt,
    });

    logger.info('Invitation email resent', {
      invitationId,
      email: invitation.email,
    });
  }

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string): Promise<UserInvitation | null> {
    return this.prisma.userInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }
}
