-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('ONE_OFF', 'FIXED_INTERVAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('HARDWARE', 'SOFTWARE', 'FURNITURE', 'VEHICLE', 'EQUIPMENT', 'PROPERTY', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'MAINTENANCE', 'REPAIR', 'RETIRED', 'DISPOSED', 'LOST');

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "description" TEXT,
    "defaultFields" JSONB NOT NULL DEFAULT '{}',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scheduleType" "ScheduleType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "intervalDays" INTEGER,
    "intervalMonths" INTEGER,
    "customRrule" TEXT,
    "nextOccurrence" TIMESTAMP(3),
    "lastOccurrence" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "taskTemplate" JSONB NOT NULL,
    "autoCreateAdvance" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_attachments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "attachmentType" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_attachments_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add Phase 2 fields to assets
ALTER TABLE "assets" ADD COLUMN "category" "AssetCategory" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "assets" ADD COLUMN "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "assets" ADD COLUMN "assetTemplateId" TEXT;
ALTER TABLE "assets" ADD COLUMN "locationId" TEXT;
ALTER TABLE "assets" ADD COLUMN "parentId" TEXT;
ALTER TABLE "assets" ADD COLUMN "path" TEXT NOT NULL DEFAULT '';
ALTER TABLE "assets" ADD COLUMN "customFields" JSONB;
ALTER TABLE "assets" ADD COLUMN "qrCode" TEXT;

-- AlterTable: Add Phase 2 fields to tasks
ALTER TABLE "tasks" ADD COLUMN "scheduleId" TEXT;

-- CreateIndex
CREATE INDEX "locations_organizationId_idx" ON "locations"("organizationId");
CREATE INDEX "locations_parentId_idx" ON "locations"("parentId");
CREATE INDEX "locations_path_idx" ON "locations"("path");
CREATE UNIQUE INDEX "locations_organizationId_name_parentId_key" ON "locations"("organizationId", "name", "parentId");

-- CreateIndex
CREATE INDEX "asset_templates_organizationId_idx" ON "asset_templates"("organizationId");
CREATE INDEX "asset_templates_category_idx" ON "asset_templates"("category");
CREATE UNIQUE INDEX "asset_templates_organizationId_name_key" ON "asset_templates"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assets_qrCode_key" ON "assets"("qrCode");
CREATE INDEX "assets_category_idx" ON "assets"("category");
CREATE INDEX "assets_locationId_idx" ON "assets"("locationId");
CREATE INDEX "assets_assetTemplateId_idx" ON "assets"("assetTemplateId");
CREATE INDEX "assets_qrCode_idx" ON "assets"("qrCode");

-- CreateIndex
CREATE INDEX "tasks_scheduleId_idx" ON "tasks"("scheduleId");

-- CreateIndex
CREATE INDEX "schedules_organizationId_idx" ON "schedules"("organizationId");
CREATE INDEX "schedules_assetId_idx" ON "schedules"("assetId");
CREATE INDEX "schedules_nextOccurrence_idx" ON "schedules"("nextOccurrence");
CREATE INDEX "schedules_isActive_idx" ON "schedules"("isActive");

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "asset_attachments_assetId_idx" ON "asset_attachments"("assetId");
CREATE INDEX "asset_attachments_uploadedByUserId_idx" ON "asset_attachments"("uploadedByUserId");
CREATE INDEX "asset_attachments_attachmentType_idx" ON "asset_attachments"("attachmentType");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_templates" ADD CONSTRAINT "asset_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assetTemplateId_fkey" FOREIGN KEY ("assetTemplateId") REFERENCES "asset_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_attachments" ADD CONSTRAINT "asset_attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;