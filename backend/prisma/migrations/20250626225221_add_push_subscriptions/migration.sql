/*
  Warnings:

  - Made the column `sendInApp` on table `notifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sendEmail` on table `notifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sendPush` on table `notifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subtaskOrder` on table `tasks` required. This step will fail if there are existing NULL values in that column.
  - Made the column `completionRequirements` on table `tasks` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isPhotoRequired` on table `tasks` required. This step will fail if there are existing NULL values in that column.
  - Made the column `checklistItems` on table `tasks` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "activity_streams" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "calendar_integrations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mentions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_queue" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "sendInApp" SET NOT NULL,
ALTER COLUMN "sendEmail" SET NOT NULL,
ALTER COLUMN "sendPush" SET NOT NULL;

-- AlterTable
ALTER TABLE "schedule_dependencies" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "schedule_rules" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "task_calendar_sync" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "subtaskOrder" SET NOT NULL,
ALTER COLUMN "completionRequirements" SET NOT NULL,
ALTER COLUMN "isPhotoRequired" SET NOT NULL,
ALTER COLUMN "checklistItems" SET NOT NULL;

-- AlterTable
ALTER TABLE "usage_counters" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_invitations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_notification_preferences" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "webhook_subscriptions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "objectDisplayName" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetDisplayName" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activities_eventId_key" ON "activities"("eventId");

-- CreateIndex
CREATE INDEX "activities_organizationId_targetType_targetId_idx" ON "activities"("organizationId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "activities_organizationId_actorId_idx" ON "activities"("organizationId", "actorId");

-- CreateIndex
CREATE INDEX "activities_organizationId_objectType_objectId_idx" ON "activities"("organizationId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "activities_organizationId_timestamp_idx" ON "activities"("organizationId", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "user_notification_preferences_userId_channel_notificationType_k" RENAME TO "user_notification_preferences_userId_channel_notificationTy_key";
