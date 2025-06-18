-- AlterTable
ALTER TABLE "api_tokens" ADD COLUMN "tokenPrefix" VARCHAR(8);

-- CreateIndex
CREATE INDEX "api_tokens_tokenPrefix_idx" ON "api_tokens"("tokenPrefix");