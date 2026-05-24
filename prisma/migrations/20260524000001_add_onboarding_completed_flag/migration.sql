-- Add onboarding_completed boolean to player_profiles.
-- Backfill: any profile that already has non-empty preferences is considered
-- to have completed onboarding.
ALTER TABLE "player_profiles"
  ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "player_profiles"
  SET "onboarding_completed" = true
  WHERE preferences::text != '{}' AND preferences::text != 'null';
