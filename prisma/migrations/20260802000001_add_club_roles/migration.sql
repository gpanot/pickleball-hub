-- Migration: add ClubRole enum to app_club_managers
-- Replaces the free-text "creator"/"manager" strings with a typed enum.
-- Idempotent: safe to re-run.

-- 1. Create the enum type (skip if already exists)
DO $$ BEGIN
  CREATE TYPE "ClubRole" AS ENUM ('OWNER', 'ADMIN', 'HOST_MANAGER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Convert the role column from TEXT to the new enum.
--    Drop the text default first — PostgreSQL cannot cast 'manager' to ClubRole
--    implicitly and will fail if we leave the DEFAULT in place during the ALTER.
ALTER TABLE "app_club_managers" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "app_club_managers"
  ALTER COLUMN "role" TYPE "ClubRole"
  USING (
    CASE "role"::text
      WHEN 'creator'  THEN 'OWNER'::"ClubRole"
      WHEN 'OWNER'    THEN 'OWNER'::"ClubRole"
      WHEN 'ADMIN'    THEN 'ADMIN'::"ClubRole"
      ELSE 'HOST_MANAGER'::"ClubRole"
    END
  );

-- 3. Set default value
ALTER TABLE "app_club_managers"
  ALTER COLUMN "role" SET DEFAULT 'HOST_MANAGER'::"ClubRole";

-- 4. Partial unique index: exactly one OWNER per club
CREATE UNIQUE INDEX IF NOT EXISTS "one_owner_per_club"
  ON "app_club_managers" ("app_club_id")
  WHERE role = 'OWNER';

-- 5. Backfill: ensure every AppClub has an OWNER row.
--    In practice all existing clubs already have a "creator" row (now OWNER),
--    but this covers any edge-case gaps.
INSERT INTO "app_club_managers" ("id", "app_club_id", "player_profile_id", "role", "added_by_id")
SELECT
  gen_random_uuid()::text,
  ac.id,
  ac.creator_id,
  'OWNER'::"ClubRole",
  ac.creator_id
FROM "app_clubs" ac
WHERE NOT EXISTS (
  SELECT 1 FROM "app_club_managers" acm
  WHERE acm.app_club_id = ac.id AND acm.role = 'OWNER'
)
ON CONFLICT ("app_club_id", "player_profile_id") DO UPDATE
  SET role = 'OWNER'::"ClubRole";
