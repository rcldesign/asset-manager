import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { addActivityJob } from '../lib/queue';
import { logger } from '../utils/logger';
import type {
  ActivityEventPayload,
  ActivityQueryOptions,
  ActivityFeedResult,
  ActivityWithRelations,
  CreateActivityEvent,
} from '../types/activity';

/**
 * Activity Stream Service
 *
 * Provides methods for creating activity events and querying activity feeds.
 * Uses event-driven architecture with BullMQ for reliable activity tracking.
 */
export class ActivityStreamService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Emit an activity event to the queue for processing
   * This is the primary method services should use to record activities
   *
   * @param event - Activity event data (without eventId and timestamp)
   * @returns Promise that resolves when event is queued
   */
  async emitActivity(event: CreateActivityEvent): Promise<void> {
    const activityEvent: ActivityEventPayload = {
      ...event,
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    try {
      await addActivityJob(activityEvent);

      logger.debug('Activity event emitted', {
        eventId: activityEvent.eventId,
        verb: activityEvent.verb,
        objectType: activityEvent.object.type,
        objectId: activityEvent.object.id,
      });
    } catch (error) {
      logger.error(
        'Failed to emit activity event',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      logger.debug('Activity event details', {
        eventId: activityEvent.eventId,
        verb: activityEvent.verb,
        objectType: activityEvent.object.type,
      });
      // Don't throw - activity tracking should not fail the primary operation
    }
  }

  /**
   * Get activity feed for an organization with filtering and pagination
   *
   * @param options - Query options for filtering and pagination
   * @returns Paginated activity feed
   */
  async getActivityFeed(options: ActivityQueryOptions): Promise<ActivityFeedResult> {
    const {
      organizationId,
      actorId,
      targetType,
      targetId,
      objectType,
      objectId,
      verb,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = options;

    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100); // Cap at 100 items per page

    // Build where conditions
    const where: Prisma.ActivityWhereInput = {
      organizationId,
    };

    if (actorId) {
      where.actorId = actorId;
    }

    if (targetType && targetId) {
      where.targetType = targetType;
      where.targetId = targetId;
    }

    if (objectType) {
      where.objectType = objectType;
    }

    if (objectId) {
      where.objectId = objectId;
    }

    if (verb) {
      where.verb = verb;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    try {
      const [activities, total] = await this.prisma.$transaction([
        this.prisma.activity.findMany({
          where,
          orderBy: {
            timestamp: 'desc',
          },
          skip,
          take,
        }),
        this.prisma.activity.count({ where }),
      ]);

      return {
        data: activities as ActivityWithRelations[],
        meta: {
          total,
          page,
          limit: take,
          lastPage: Math.ceil(total / take),
        },
      };
    } catch (error) {
      logger.error(
        'Failed to fetch activity feed',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      logger.debug('Activity query details', {
        organizationId: options.organizationId,
        filters: Object.keys(options).filter((key) => (options as any)[key] !== undefined),
      });
      throw error;
    }
  }

  /**
   * Get activity feed for a specific asset
   *
   * @param assetId - Asset ID to get activities for
   * @param organizationId - Organization ID for security
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 20)
   * @returns Paginated activity feed for the asset
   */
  async getAssetActivityFeed(
    assetId: string,
    organizationId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<ActivityFeedResult> {
    return this.getActivityFeed({
      organizationId,
      targetType: 'Asset',
      targetId: assetId,
      page,
      limit,
    });
  }

  /**
   * Get activity feed for a specific user
   *
   * @param userId - User ID to get activities for
   * @param organizationId - Organization ID for security
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 20)
   * @returns Paginated activity feed for the user
   */
  async getUserActivityFeed(
    userId: string,
    organizationId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<ActivityFeedResult> {
    return this.getActivityFeed({
      organizationId,
      actorId: userId,
      page,
      limit,
    });
  }

  /**
   * Get recent activity summary for an organization
   *
   * @param organizationId - Organization ID
   * @param hours - Number of hours to look back (default: 24)
   * @returns Activity summary statistics
   */
  async getActivitySummary(
    organizationId: string,
    hours: number = 24,
  ): Promise<{
    totalActivities: number;
    activitiesByVerb: Record<string, number>;
    activitiesByObjectType: Record<string, number>;
    topActors: Array<{ actorId: string; actorName: string; count: number }>;
  }> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    try {
      const [totalActivities, activitiesByVerb, activitiesByObjectType, topActors] =
        await this.prisma.$transaction([
          // Total count
          this.prisma.activity.count({
            where: {
              organizationId,
              timestamp: { gte: since },
            },
          }),

          // Group by verb
          this.prisma.activity.groupBy({
            by: ['verb'],
            where: {
              organizationId,
              timestamp: { gte: since },
            },
            _count: {
              verb: true,
            },
            orderBy: {
              verb: 'asc',
            },
          }),

          // Group by object type
          this.prisma.activity.groupBy({
            by: ['objectType'],
            where: {
              organizationId,
              timestamp: { gte: since },
            },
            _count: {
              objectType: true,
            },
            orderBy: {
              objectType: 'asc',
            },
          }),

          // Top actors
          this.prisma.activity.groupBy({
            by: ['actorId', 'actorName'],
            where: {
              organizationId,
              timestamp: { gte: since },
            },
            _count: {
              actorId: true,
            },
            orderBy: {
              _count: {
                actorId: 'desc',
              },
            },
            take: 5,
          }),
        ]);

      return {
        totalActivities,
        activitiesByVerb: activitiesByVerb.reduce(
          (acc: Record<string, number>, item: any) => {
            acc[item.verb] = item._count.verb;
            return acc;
          },
          {} as Record<string, number>,
        ),
        activitiesByObjectType: activitiesByObjectType.reduce(
          (acc: Record<string, number>, item: any) => {
            acc[item.objectType] = item._count.objectType;
            return acc;
          },
          {} as Record<string, number>,
        ),
        topActors: topActors.map((item: any) => ({
          actorId: item.actorId,
          actorName: item.actorName,
          count: item._count.actorId,
        })),
      };
    } catch (error) {
      logger.error(
        'Failed to get activity summary',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      logger.debug('Activity summary query details', {
        orgId: organizationId,
        timeFrame: `${hours} hours`,
      });
      throw error;
    }
  }
}
