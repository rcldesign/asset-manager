/**
 * Activity Stream Types and Interfaces
 *
 * Implements Actor-Verb-Object model for tracking user activities
 * with denormalized data for historical accuracy and performance.
 */

export interface ActivityEventPayload {
  eventId: string; // UUID for idempotency
  organizationId: string;

  actor: {
    type: 'User';
    id: string;
    name: string; // Current name, will be denormalized
  };

  verb:
    | 'created'
    | 'updated'
    | 'deleted'
    | 'completed'
    | 'commented'
    | 'assigned'
    | 'mentioned'
    | 'invited'
    | 'activated'
    | 'deactivated';

  object: {
    type:
      | 'Task'
      | 'Asset'
      | 'Schedule'
      | 'Comment'
      | 'AssetTemplate'
      | 'Location'
      | 'User'
      | 'Invitation';
    id: string;
    displayName: string; // Current display name
  };

  target?: {
    type: 'Asset' | 'Schedule' | 'Project' | 'Organization';
    id: string;
    displayName: string;
  };

  metadata?: {
    changes?: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
    [key: string]: any;
  };

  timestamp: string; // ISO string
}

export interface ActivityQueryOptions {
  organizationId: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  objectType?: string;
  objectId?: string;
  verb?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface ActivityFeedResult {
  data: ActivityWithRelations[];
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  };
}

export interface ActivityWithRelations {
  id: string;
  eventId: string;
  organizationId: string;
  actorType: string;
  actorId: string;
  actorName: string;
  verb: string;
  objectType: string;
  objectId: string;
  objectDisplayName: string;
  targetType: string | null;
  targetId: string | null;
  targetDisplayName: string | null;
  metadata: any;
  timestamp: Date;
  createdAt: Date;
}

/**
 * Helper type for creating activity events from services
 */
export type CreateActivityEvent = Omit<ActivityEventPayload, 'eventId' | 'timestamp'>;

/**
 * Common activity verbs as constants for type safety
 */
export const ActivityVerbs = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  COMPLETED: 'completed',
  COMMENTED: 'commented',
  ASSIGNED: 'assigned',
  MENTIONED: 'mentioned',
  INVITED: 'invited',
  ACTIVATED: 'activated',
  DEACTIVATED: 'deactivated',
} as const;

/**
 * Common object types as constants for type safety
 */
export const ActivityObjectTypes = {
  TASK: 'Task',
  ASSET: 'Asset',
  SCHEDULE: 'Schedule',
  COMMENT: 'Comment',
  ASSET_TEMPLATE: 'AssetTemplate',
  LOCATION: 'Location',
  USER: 'User',
  INVITATION: 'Invitation',
} as const;

/**
 * Common target types as constants for type safety
 */
export const ActivityTargetTypes = {
  ASSET: 'Asset',
  SCHEDULE: 'Schedule',
  PROJECT: 'Project',
  ORGANIZATION: 'Organization',
} as const;
