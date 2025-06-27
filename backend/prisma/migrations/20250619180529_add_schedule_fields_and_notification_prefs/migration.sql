-- AlterTable
ALTER TABLE "assets" ALTER COLUMN "category" DROP DEFAULT,
ALTER COLUMN "path" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "scheduleId" TEXT;

-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "currentUsage" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "monthlyDayOfMonth" INTEGER,
ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "recurrenceRule" TEXT,
ADD COLUMN     "seasonalMonths" JSONB,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "usageThreshold" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationPreferences" JSONB NOT NULL DEFAULT '{}';

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
