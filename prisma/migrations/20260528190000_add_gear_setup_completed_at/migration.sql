-- Add setup_completed_at to player_gear so we can detect
-- completed gear setup server-side (survives reinstall).
ALTER TABLE "player_gear" ADD COLUMN IF NOT EXISTS "setup_completed_at" TIMESTAMP(3);

-- Backfill: mark existing rows as completed when all 4 gear zones are filled.
UPDATE "player_gear"
SET "setup_completed_at" = NOW()
WHERE cap IS NOT NULL
  AND shirt IS NOT NULL
  AND paddle IS NOT NULL
  AND shoes IS NOT NULL
  AND "setup_completed_at" IS NULL;
