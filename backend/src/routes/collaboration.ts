import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
// import { z } from 'zod';
import {
  authenticateJWT as authenticate,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/auth';
// import { validateRequest } from '../middleware/validation';
import { CollaborationService } from '../services/collaboration.service';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();
const collaborationService = new CollaborationService(prisma);

// Validation schemas - commented out until validateRequest is implemented
/*
const createInvitationSchema = z.object({
  body: z.object({
    email: z.string().email(),
    role: z.nativeEnum(UserRole),
    customMessage: z.string().optional(),
  }),
});

const acceptInvitationSchema = z.object({
  body: z.object({
    token: z.string(),
    fullName: z.string().min(1).max(255),
    password: z.string().min(8),
  }),
});

const parseMentionsSchema = z.object({
  body: z.object({
    content: z.string(),
  }),
});

const createMentionsSchema = z.object({
  params: z.object({
    commentId: z.string().uuid(),
  }),
  body: z.object({
    content: z.string(),
  }),
});
*/

/**
 * @route POST /api/collaboration/invitations
 * @desc Create and send a user invitation
 * @access Private (Admin)
 */
router.post(
  '/invitations',
  authenticate,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, role, customMessage } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const invitedByUserId = authenticatedReq.user.id;

      const invitation = await collaborationService.createInvitation({
        organizationId,
        email,
        role,
        invitedByUserId,
        customMessage,
      });

      res.status(201).json({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/collaboration/invitations/accept
 * @desc Accept an invitation and create user account
 * @access Public
 */
router.post('/invitations/accept', async (req: any, res: Response, next: NextFunction) => {
  try {
    const { token, fullName, password } = req.body;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await collaborationService.acceptInvitation(token, {
      fullName,
      password: passwordHash,
    });

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizationId: user.organizationId,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/collaboration/invitations/verify/:token
 * @desc Verify invitation token and get details
 * @access Public
 */
router.get('/invitations/verify/:token', (async (req: any, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    const invitation = await collaborationService.getInvitationByToken(token);

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ message: 'Invitation has already been used' });
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Invitation has expired' });
    }

    return res.json({
      email: invitation.email,
      role: invitation.role,
      organizationName: (invitation as any).organization.name,
      invitedBy: (invitation as any).invitedBy.fullName || (invitation as any).invitedBy.email,
    });
  } catch (error) {
    next(error);
    return;
  }
}) as RequestHandler);

/**
 * @route DELETE /api/collaboration/invitations/:id
 * @desc Cancel a pending invitation
 * @access Private (Admin)
 */
router.delete(
  '/invitations/:id',
  authenticate,
  requireRole('OWNER'),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const cancelledBy = authenticatedReq.user.id;

      await collaborationService.cancelInvitation(id, organizationId, cancelledBy);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/collaboration/invitations
 * @desc List invitations for the organization
 * @access Private (Admin)
 */
router.get(
  '/invitations',
  authenticate,
  requireRole('OWNER'),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const { status, page, limit } = req.query;

      const result = await collaborationService.listInvitations(organizationId, {
        status: status,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/collaboration/invitations/:id/resend
 * @desc Resend invitation email
 * @access Private (Admin)
 */
router.post(
  '/invitations/:id/resend',
  authenticate,
  requireRole('OWNER'),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      await collaborationService.resendInvitation(id, organizationId);

      res.json({ message: 'Invitation email resent' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/collaboration/mentions/parse
 * @desc Parse mentions in text content
 * @access Private
 */
router.post(
  '/mentions/parse',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { content } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      const result = await collaborationService.parseMentions(content, organizationId);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/collaboration/comments/:commentId/mentions
 * @desc Create mentions from a comment
 * @access Private
 */
router.post(
  '/comments/:commentId/mentions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const { content } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const mentionedBy = authenticatedReq.user.id;

      await collaborationService.createMentionsFromComment(
        commentId!,
        content,
        organizationId,
        mentionedBy,
      );

      res.status(201).json({ message: 'Mentions created' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/collaboration/mentionable-users
 * @desc Get users available for mention
 * @access Private
 */
router.get(
  '/mentionable-users',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const { search } = req.query;

      const users = await collaborationService.getMentionableUsers(
        organizationId,
        search as string | undefined,
      );

      res.json(users);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
