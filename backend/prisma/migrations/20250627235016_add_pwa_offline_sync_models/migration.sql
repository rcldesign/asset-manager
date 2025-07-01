/*
  Warnings:

  - You are about to drop the column `frequency` on the `scheduled_reports` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `scheduled_reports` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `scheduled_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `format` to the `scheduled_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `scheduled_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `scheduled_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schedule` to the `scheduled_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `scheduled_reports` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "scheduled_reports_nextRunAt_isActive_idx";

-- AlterTable
ALTER TABLE "activity_streams" ADD COLUMN     "entityName" TEXT;

-- AlterTable
ALTER TABLE "scheduled_reports" DROP COLUMN "frequency",
DROP COLUMN "isActive",
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "filters" JSONB,
ADD COLUMN     "format" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "schedule" JSONB NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT;

-- CreateTable
CREATE TABLE "report_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "scheduledReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_history_organizationId_idx" ON "report_history"("organizationId");

-- CreateIndex
CREATE INDEX "report_history_generatedById_idx" ON "report_history"("generatedById");

-- CreateIndex
CREATE INDEX "report_history_generatedAt_idx" ON "report_history"("generatedAt");

-- CreateIndex
CREATE INDEX "report_history_scheduledReportId_idx" ON "report_history"("scheduledReportId");

-- CreateIndex
CREATE INDEX "scheduled_reports_nextRunAt_enabled_idx" ON "scheduled_reports"("nextRunAt", "enabled");

-- CreateIndex
CREATE INDEX "scheduled_reports_organizationId_idx" ON "scheduled_reports"("organizationId");

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_scheduledReportId_fkey" FOREIGN KEY ("scheduledReportId") REFERENCES "scheduled_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
