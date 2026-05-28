-- AlterTable
ALTER TABLE "session_rosters" ADD COLUMN     "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
