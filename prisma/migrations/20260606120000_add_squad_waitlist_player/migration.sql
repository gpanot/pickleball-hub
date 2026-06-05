-- AlterTable
ALTER TABLE "squad_waitlist" ADD COLUMN IF NOT EXISTS "profile_id" TEXT;
ALTER TABLE "squad_waitlist" ADD COLUMN IF NOT EXISTS "player_name" TEXT;
ALTER TABLE "squad_waitlist" ADD COLUMN IF NOT EXISTS "player_email" TEXT;
ALTER TABLE "squad_waitlist" ADD COLUMN IF NOT EXISTS "player_dupr" DECIMAL(5,3);
