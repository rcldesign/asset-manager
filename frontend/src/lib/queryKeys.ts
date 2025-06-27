/**
 * Query keys factory for React Query cache management
 * Provides a type-safe, hierarchical structure for query keys
 */

export const queryKeys = {
  all: ['dumb-assets'] as const,
  
  // Existing resources
  assets: {
    all: () => [...queryKeys.all, 'assets'] as const,
    list: (filters?: any) => [...queryKeys.assets.all(), 'list', filters] as const,
    detail: (id: string) => [...queryKeys.assets.all(), 'detail', id] as const,
    history: (id: string) => [...queryKeys.assets.detail(id), 'history'] as const,
    attachments: (id: string) => [...queryKeys.assets.detail(id), 'attachments'] as const,
  },
  
  tasks: {
    all: () => [...queryKeys.all, 'tasks'] as const,
    list: (filters?: any) => [...queryKeys.tasks.all(), 'list', filters] as const,
    detail: (id: string) => [...queryKeys.tasks.all(), 'detail', id] as const,
    subtasks: (id: string) => [...queryKeys.tasks.detail(id), 'subtasks'] as const,
    assignments: (id: string) => [...queryKeys.tasks.detail(id), 'assignments'] as const,
    history: (id: string) => [...queryKeys.tasks.detail(id), 'history'] as const,
    attachments: (id: string) => [...queryKeys.tasks.detail(id), 'attachments'] as const,
  },
  
  schedules: {
    all: () => [...queryKeys.all, 'schedules'] as const,
    list: (filters?: any) => [...queryKeys.schedules.all(), 'list', filters] as const,
    detail: (id: string) => [...queryKeys.schedules.all(), 'detail', id] as const,
    preview: (id: string) => [...queryKeys.schedules.detail(id), 'preview'] as const,
    advanced: () => [...queryKeys.schedules.all(), 'advanced'] as const,
  },
  
  users: {
    all: () => [...queryKeys.all, 'users'] as const,
    list: () => [...queryKeys.users.all(), 'list'] as const,
    detail: (id: string) => [...queryKeys.users.all(), 'detail', id] as const,
    invitations: () => [...queryKeys.users.all(), 'invitations'] as const,
    current: () => [...queryKeys.users.all(), 'current'] as const,
  },
  
  // New Phase 3 resources
  invitations: {
    all: () => [...queryKeys.all, 'invitations'] as const,
    list: (filters?: any) => [...queryKeys.invitations.all(), 'list', filters] as const,
    detail: (id: string) => [...queryKeys.invitations.all(), 'detail', id] as const,
    pending: () => [...queryKeys.invitations.all(), 'pending'] as const,
  },
  
  notifications: {
    all: () => [...queryKeys.all, 'notifications'] as const,
    list: (filters?: any) => [...queryKeys.notifications.all(), 'list', filters] as const,
    settings: () => [...queryKeys.notifications.all(), 'settings'] as const,
    preferences: () => [...queryKeys.notifications.all(), 'preferences'] as const,
    unread: () => [...queryKeys.notifications.all(), 'unread'] as const,
  },
  
  activityStreams: {
    all: () => [...queryKeys.all, 'activity-streams'] as const,
    list: (filters?: any) => [...queryKeys.activityStreams.all(), 'list', filters] as const,
    byAsset: (assetId: string) => [...queryKeys.activityStreams.all(), 'asset', assetId] as const,
    byOrganization: () => [...queryKeys.activityStreams.all(), 'organization'] as const,
  },
  
  calendar: {
    all: () => [...queryKeys.all, 'calendar'] as const,
    google: {
      status: () => [...queryKeys.calendar.all(), 'google', 'status'] as const,
      authUrl: () => [...queryKeys.calendar.all(), 'google', 'auth-url'] as const,
    },
    ical: {
      status: () => [...queryKeys.calendar.all(), 'ical', 'status'] as const,
      token: () => [...queryKeys.calendar.all(), 'ical', 'token'] as const,
    },
  },
  
  webhooks: {
    all: () => [...queryKeys.all, 'webhooks'] as const,
    list: () => [...queryKeys.webhooks.all(), 'list'] as const,
    detail: (id: string) => [...queryKeys.webhooks.all(), 'detail', id] as const,
    deliveries: (id: string) => [...queryKeys.webhooks.detail(id), 'deliveries'] as const,
  },
  
  locations: {
    all: () => [...queryKeys.all, 'locations'] as const,
    tree: () => [...queryKeys.locations.all(), 'tree'] as const,
    detail: (id: string) => [...queryKeys.locations.all(), 'detail', id] as const,
  },
  
  assetTemplates: {
    all: () => [...queryKeys.all, 'asset-templates'] as const,
    list: (filters?: any) => [...queryKeys.assetTemplates.all(), 'list', filters] as const,
    detail: (id: string) => [...queryKeys.assetTemplates.all(), 'detail', id] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;