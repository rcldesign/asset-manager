-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'COMPLETED', 'FAILED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ConflictResolution" AS ENUM ('CLIENT_WINS', 'SERVER_WINS', 'MANUAL', 'MERGE');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "sync_clients" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "payload" JSONB NOT NULL,
    "clientVersion" INTEGER NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "conflictData" JSONB,
    "resolution" "ConflictResolution",
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_metadata" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastModifiedBy" TEXT NOT NULL,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT,
    "deletedAt" TIMESTAMP(3),
    "clientId" TEXT,

    CONSTRAINT "sync_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "clientVersion" INTEGER NOT NULL,
    "serverVersion" INTEGER NOT NULL,
    "clientData" JSONB NOT NULL,
    "serverData" JSONB NOT NULL,
    "resolution" "ConflictResolution" NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_clients_userId_idx" ON "sync_clients"("userId");

-- CreateIndex
CREATE INDEX "sync_clients_lastSyncAt_idx" ON "sync_clients"("lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "sync_clients_userId_deviceId_key" ON "sync_clients"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "sync_queue_clientId_status_idx" ON "sync_queue"("clientId", "status");

-- CreateIndex
CREATE INDEX "sync_queue_entityType_entityId_idx" ON "sync_queue"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "sync_queue_createdAt_idx" ON "sync_queue"("createdAt");

-- CreateIndex
CREATE INDEX "sync_metadata_entityType_lastModifiedAt_idx" ON "sync_metadata"("entityType", "lastModifiedAt");

-- CreateIndex
CREATE INDEX "sync_metadata_deletedAt_idx" ON "sync_metadata"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sync_metadata_entityType_entityId_key" ON "sync_metadata"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "sync_conflicts_entityType_entityId_idx" ON "sync_conflicts"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "sync_conflicts_createdAt_idx" ON "sync_conflicts"("createdAt");

-- AddForeignKey
ALTER TABLE "sync_clients" ADD CONSTRAINT "sync_clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sync_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_metadata" ADD CONSTRAINT "sync_metadata_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sync_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
