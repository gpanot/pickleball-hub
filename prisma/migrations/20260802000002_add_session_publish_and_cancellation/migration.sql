-- AlterTable
ALTER TABLE "club_sessions" ADD COLUMN IF NOT EXISTS "publish_after_min" INTEGER;
ALTER TABLE "club_sessions" ADD COLUMN IF NOT EXISTS "cancellation_cutoff_min" INTEGER;
