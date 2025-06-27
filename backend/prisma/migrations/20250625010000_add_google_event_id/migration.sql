-- Add googleEventId to tasks table
ALTER TABLE "tasks" ADD COLUMN "googleEventId" TEXT;

-- Add unique constraint to usage_counters
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_assetId_counterType_key" UNIQUE("assetId", "counterType");