-- AlterTable
ALTER TABLE "ai_assistant_logs" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'admin';

-- CreateIndex
CREATE INDEX "ai_assistant_logs_source_idx" ON "ai_assistant_logs"("source");
