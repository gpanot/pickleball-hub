-- AlterTable
ALTER TABLE "squad_waitlist" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'Vietnam';
ALTER TABLE "squad_waitlist" ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT 'Ho Chi Minh City';

-- Remove defaults after backfill (optional clean-up for new rows)
ALTER TABLE "squad_waitlist" ALTER COLUMN "country" DROP DEFAULT;
ALTER TABLE "squad_waitlist" ALTER COLUMN "city" DROP DEFAULT;
