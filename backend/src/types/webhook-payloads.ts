import type {
  AssetCategory,
  AssetStatus,
  TaskStatus,
  TaskPriority,
  UserRole,
  ActionType,
  ConflictResolution,
  ReportType,
  ReportStatus,
} from '@prisma/client';

// Base interfaces for common structures
export interface WebhookUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface WebhookOrganization {
  id: string;
  name: string;
}

export interface WebhookLocation {
  id: string;
  name: string;
  path: string;
}

export interface WebhookAsset {
  id: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  qrCode?: string;
  serialNumber?: string;
  locationId?: string;
  locationName?: string;
  assetTemplateId?: string;
  assetTemplateName?: string;
}

export interface WebhookTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date;
  estimatedMinutes?: number;
  actualMinutes?: number;
  actualCost?: number;
  assetId?: string;
  assetName?: string;
  scheduleId?: string;
  scheduleName?: string;
}

// Enhanced base webhook event interface
export interface EnhancedWebhookEvent<T = any> {
  id: string;
  type: string;
  organizationId: string;
  organization: WebhookOrganization;
  timestamp: Date;
  triggeredBy: WebhookUser;
  data: T;
  metadata?: Record<string, any>;
}

// Asset event payloads
export interface AssetCreatedPayload {
  asset: WebhookAsset;
  location?: WebhookLocation;
  parentAsset?: {
    id: string;
    name: string;
  };
  customFields?: Record<string, any>;
}

export interface AssetUpdatedPayload {
  asset: WebhookAsset;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  location?: WebhookLocation;
  previousLocation?: WebhookLocation;
}

export interface AssetDeletedPayload {
  asset: WebhookAsset;
  deletionReason?: string;
  childAssets?: {
    id: string;
    name: string;
  }[];
}

// Task event payloads
export interface TaskCreatedPayload {
  task: WebhookTask;
  asset?: WebhookAsset;
  assignedUsers?: WebhookUser[];
  checklist?: any[];
}

export interface TaskUpdatedPayload {
  task: WebhookTask;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  asset?: WebhookAsset;
  assignedUsers?: WebhookUser[];
}

export interface TaskCompletedPayload {
  task: WebhookTask;
  completedBy: WebhookUser;
  completionDetails: {
    actualMinutes?: number;
    actualCost?: number;
    notes?: string;
    checklistCompletion?: number;
    attachments?: number;
  };
  asset?: WebhookAsset;
}

export interface TaskAssignedPayload {
  task: WebhookTask;
  assignedTo: WebhookUser[];
  assignedBy: WebhookUser;
  previousAssignees?: WebhookUser[];
}

export interface TaskDeletedPayload {
  task: WebhookTask;
  deletionReason?: string;
}

export interface TaskOverduePayload {
  task: WebhookTask;
  overdueDays: number;
  assignedUsers?: WebhookUser[];
  asset?: WebhookAsset;
}

// Schedule event payloads
export interface ScheduleCreatedPayload {
  schedule: {
    id: string;
    name: string;
    frequency: string;
    nextRun?: Date;
    isActive: boolean;
  };
  taskCount: number;
}

export interface ScheduleUpdatedPayload {
  schedule: {
    id: string;
    name: string;
    frequency: string;
    nextRun?: Date;
    isActive: boolean;
  };
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export interface ScheduleDeletedPayload {
  schedule: {
    id: string;
    name: string;
  };
  affectedTasks: number;
}

// User event payloads
export interface UserInvitedPayload {
  invitedUser: {
    email: string;
    role: UserRole;
  };
  invitedBy: WebhookUser;
  invitationId: string;
}

export interface UserJoinedPayload {
  user: WebhookUser;
  invitedBy?: WebhookUser;
}

export interface UserDeactivatedPayload {
  user: WebhookUser;
  deactivatedBy: WebhookUser;
  reassignedTasks?: number;
}

// Maintenance event payloads
export interface MaintenanceStartedPayload {
  task: WebhookTask;
  startedBy: WebhookUser;
  asset: WebhookAsset;
  estimatedDuration?: number;
}

export interface MaintenanceCompletedPayload {
  task: WebhookTask;
  completedBy: WebhookUser;
  asset: WebhookAsset;
  duration: number;
  cost?: number;
  notes?: string;
}

// Warranty event payloads
export interface WarrantyExpiringPayload {
  asset: WebhookAsset;
  warrantyEndDate: Date;
  daysUntilExpiry: number;
  vendor?: string;
}

export interface WarrantyExpiredPayload {
  asset: WebhookAsset;
  warrantyEndDate: Date;
  daysSinceExpiry: number;
  vendor?: string;
}

// Audit event payloads
export interface AuditCreatedPayload {
  audit: {
    id: string;
    model: string;
    recordId: string;
    action: ActionType;
    userId: string;
    timestamp: Date;
  };
  user: WebhookUser;
  changes?: {
    oldValue: any;
    newValue: any;
  };
  affectedEntity?: {
    type: string;
    id: string;
    name?: string;
  };
}

// Report event payloads
export interface ReportGeneratedPayload {
  report: {
    id: string;
    type: ReportType;
    name: string;
    format: string;
    status: ReportStatus;
    generatedAt: Date;
  };
  requestedBy: WebhookUser;
  downloadUrl?: string;
  expiresAt?: Date;
}

export interface ReportScheduledPayload {
  scheduledReport: {
    id: string;
    reportType: ReportType;
    name: string;
    frequency: string;
    nextRun: Date;
    recipients: string[];
  };
  createdBy: WebhookUser;
}

// Backup event payloads
export interface BackupCreatedPayload {
  backup: {
    id: string;
    type: 'full' | 'database' | 'files';
    size: number;
    location: string;
    createdAt: Date;
  };
  initiatedBy: WebhookUser;
  includedEntities: {
    assets: number;
    tasks: number;
    users: number;
    attachments: number;
  };
}

export interface BackupRestoredPayload {
  backup: {
    id: string;
    type: 'full' | 'database' | 'files';
    restoredFrom: Date;
    restoredAt: Date;
  };
  restoredBy: WebhookUser;
  restoredEntities: {
    assets: number;
    tasks: number;
    users: number;
    attachments: number;
  };
}

// Sync event payloads
export interface SyncCompletedPayload {
  sync: {
    id: string;
    deviceId: string;
    deviceName?: string;
    syncToken: string;
    startedAt: Date;
    completedAt: Date;
  };
  user: WebhookUser;
  summary: {
    uploaded: number;
    downloaded: number;
    conflicts: number;
    conflictResolution?: ConflictResolution;
  };
}

// GDPR event payloads
export interface GDPRExportRequestedPayload {
  request: {
    id: string;
    userId: string;
    requestedAt: Date;
    status: 'pending' | 'processing' | 'completed';
  };
  requestedBy: WebhookUser;
  dataCategories: string[];
}

export interface GDPRDeletionRequestedPayload {
  request: {
    id: string;
    userId: string;
    requestedAt: Date;
    status: 'pending' | 'processing' | 'completed';
    scheduledDeletionDate?: Date;
  };
  requestedBy: WebhookUser;
  affectedData: {
    assets: number;
    tasks: number;
    comments: number;
    attachments: number;
  };
}

// Type mapping for event types to payloads
export interface WebhookEventPayloadMap {
  'asset.created': AssetCreatedPayload;
  'asset.updated': AssetUpdatedPayload;
  'asset.deleted': AssetDeletedPayload;
  'task.created': TaskCreatedPayload;
  'task.updated': TaskUpdatedPayload;
  'task.completed': TaskCompletedPayload;
  'task.assigned': TaskAssignedPayload;
  'task.deleted': TaskDeletedPayload;
  'task.overdue': TaskOverduePayload;
  'schedule.created': ScheduleCreatedPayload;
  'schedule.updated': ScheduleUpdatedPayload;
  'schedule.deleted': ScheduleDeletedPayload;
  'user.invited': UserInvitedPayload;
  'user.joined': UserJoinedPayload;
  'user.deactivated': UserDeactivatedPayload;
  'maintenance.started': MaintenanceStartedPayload;
  'maintenance.completed': MaintenanceCompletedPayload;
  'warranty.expiring': WarrantyExpiringPayload;
  'warranty.expired': WarrantyExpiredPayload;
  'audit.created': AuditCreatedPayload;
  'report.generated': ReportGeneratedPayload;
  'report.scheduled': ReportScheduledPayload;
  'backup.created': BackupCreatedPayload;
  'backup.restored': BackupRestoredPayload;
  'sync.completed': SyncCompletedPayload;
  'gdpr.export_requested': GDPRExportRequestedPayload;
  'gdpr.deletion_requested': GDPRDeletionRequestedPayload;
}

// Helper type for creating strongly typed webhook events
export type TypedWebhookEvent<T extends keyof WebhookEventPayloadMap> = EnhancedWebhookEvent<
  WebhookEventPayloadMap[T]
>;
