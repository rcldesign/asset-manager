-- Phase 3: Advanced Capabilities

-- Enums for new features
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'WEBHOOK', 'APPRISE');
CREATE TYPE "NotificationType" AS ENUM ('task-assigned', 'task-due', 'task-overdue', 'asset-warranty-expiring', 'asset-maintenance-due', 'schedule-changed', 'mention', 'invitation');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'COMPLETE', 'COMMENT', 'MENTION', 'ATTACH');
CREATE TYPE "ActivityEntityType" AS ENUM ('ASSET', 'TASK', 'SCHEDULE', 'USER', 'COMMENT');
CREATE TYPE "WebhookEventType" AS ENUM ('task.created', 'task.updated', 'task.completed', 'task.assigned', 'asset.created', 'asset.updated', 'asset.deleted', 'schedule.triggered');

-- Usage Counters for usage-based scheduling
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "counterType" TEXT NOT NULL, -- hours_used, cycles_completed, etc.
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastResetAt" TIMESTAMP(3),
    "resetValue" DOUBLE PRECISION DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- Schedule Rules for advanced scheduling
CREATE TABLE "schedule_rules" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "scheduleId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL, -- blackout_dates, business_days_only, dependency
    "ruleConfig" JSONB NOT NULL, -- Flexible configuration for different rule types
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_rules_pkey" PRIMARY KEY ("id")
);

-- Schedule Dependencies
CREATE TABLE "schedule_dependencies" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "scheduleId" TEXT NOT NULL,
    "dependsOnScheduleId" TEXT NOT NULL,
    "offsetDays" INTEGER DEFAULT 0, -- Days after dependency completion
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_dependencies_pkey" PRIMARY KEY ("id")
);

-- Subtasks (self-referential tasks)
ALTER TABLE "tasks" ADD COLUMN "parentTaskId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "subtaskOrder" INTEGER DEFAULT 0;
ALTER TABLE "tasks" ADD COLUMN "completionRequirements" JSONB DEFAULT '{}';
ALTER TABLE "tasks" ADD COLUMN "isPhotoRequired" BOOLEAN DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN "checklistItems" JSONB DEFAULT '[]';

-- User Invitations
CREATE TABLE "user_invitations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "invitedByUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- Activity Streams
CREATE TABLE "activity_streams" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_streams_pkey" PRIMARY KEY ("id")
);

-- User Notification Preferences
CREATE TABLE "user_notification_preferences" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB DEFAULT '{}', -- Channel-specific settings
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- Notification Queue (for processing)
CREATE TABLE "notification_queue" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipientId" TEXT NOT NULL, -- Could be userId, email, webhook URL, etc.
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id")
);

-- Webhook Subscriptions
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL, -- For signing payloads
    "events" TEXT[], -- Array of WebhookEventType
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "headers" JSONB DEFAULT '{}', -- Custom headers to include
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- Google Calendar Integration
CREATE TABLE "calendar_integrations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google', -- For future providers
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "settings" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_integrations_pkey" PRIMARY KEY ("id")
);

-- Task Calendar Sync tracking
CREATE TABLE "task_calendar_sync" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "taskId" TEXT NOT NULL,
    "calendarIntegrationId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncHash" TEXT, -- To detect changes
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_calendar_sync_pkey" PRIMARY KEY ("id")
);

-- Mentions tracking (for @mentions in comments)
CREATE TABLE "mentions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "commentId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- Update notifications table for enhanced features
ALTER TABLE "notifications" ADD COLUMN "channel" "NotificationChannel" DEFAULT 'IN_APP';
ALTER TABLE "notifications" ADD COLUMN "sendInApp" BOOLEAN DEFAULT true;
ALTER TABLE "notifications" ADD COLUMN "sendEmail" BOOLEAN DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN "sendPush" BOOLEAN DEFAULT false;

-- Create indexes for performance
CREATE INDEX "usage_counters_assetId_idx" ON "usage_counters"("assetId");
CREATE INDEX "usage_counters_scheduleId_idx" ON "usage_counters"("scheduleId");
CREATE INDEX "schedule_rules_scheduleId_idx" ON "schedule_rules"("scheduleId");
CREATE INDEX "schedule_dependencies_scheduleId_idx" ON "schedule_dependencies"("scheduleId");
CREATE INDEX "schedule_dependencies_dependsOnScheduleId_idx" ON "schedule_dependencies"("dependsOnScheduleId");
CREATE INDEX "tasks_parentTaskId_idx" ON "tasks"("parentTaskId");
CREATE UNIQUE INDEX "user_invitations_token_key" ON "user_invitations"("token");
CREATE INDEX "user_invitations_organizationId_idx" ON "user_invitations"("organizationId");
CREATE INDEX "user_invitations_email_idx" ON "user_invitations"("email");
CREATE INDEX "activity_streams_organizationId_idx" ON "activity_streams"("organizationId");
CREATE INDEX "activity_streams_userId_idx" ON "activity_streams"("userId");
CREATE INDEX "activity_streams_entityType_entityId_idx" ON "activity_streams"("entityType", "entityId");
CREATE INDEX "activity_streams_createdAt_idx" ON "activity_streams"("createdAt");
CREATE UNIQUE INDEX "user_notification_preferences_userId_channel_notificationType_key" ON "user_notification_preferences"("userId", "channel", "notificationType");
CREATE INDEX "notification_queue_notificationId_idx" ON "notification_queue"("notificationId");
CREATE INDEX "notification_queue_status_idx" ON "notification_queue"("status");
CREATE INDEX "webhook_subscriptions_organizationId_idx" ON "webhook_subscriptions"("organizationId");
CREATE UNIQUE INDEX "calendar_integrations_userId_provider_key" ON "calendar_integrations"("userId", "provider");
CREATE UNIQUE INDEX "task_calendar_sync_taskId_calendarIntegrationId_key" ON "task_calendar_sync"("taskId", "calendarIntegrationId");
CREATE INDEX "mentions_commentId_idx" ON "mentions"("commentId");
CREATE INDEX "mentions_mentionedUserId_idx" ON "mentions"("mentionedUserId");

-- Add foreign key constraints
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_dependencies" ADD CONSTRAINT "schedule_dependencies_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_dependencies" ADD CONSTRAINT "schedule_dependencies_dependsOnScheduleId_fkey" FOREIGN KEY ("dependsOnScheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_calendar_sync" ADD CONSTRAINT "task_calendar_sync_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_calendar_sync" ADD CONSTRAINT "task_calendar_sync_calendarIntegrationId_fkey" FOREIGN KEY ("calendarIntegrationId") REFERENCES "calendar_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mentions" ADD CONSTRAINT "mentions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;