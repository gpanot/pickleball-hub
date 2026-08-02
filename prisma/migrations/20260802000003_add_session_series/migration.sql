-- Migration: add SessionSeries model and ClubSession series fields
-- Idempotent: safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. Create session_series table
CREATE TABLE IF NOT EXISTS "session_series" (
    "id"                TEXT NOT NULL,
    "club_id"           TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "weekday"           INTEGER NOT NULL,
    "start_time_local"  TEXT NOT NULL,
    "duration_min"      INTEGER NOT NULL,
    "timezone"          TEXT NOT NULL,
    "sport_id"          INTEGER,
    "format"            TEXT NOT NULL,
    "host_role"         TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "venue_id"          INTEGER,
    "venue_pending"     BOOLEAN NOT NULL DEFAULT false,
    "max_players"       INTEGER NOT NULL,
    "requires_approval" BOOLEAN NOT NULL,
    "auto_confirm_mode" TEXT NOT NULL,
    "privacy"           TEXT NOT NULL,
    "fee_amount"        DECIMAL(10,2),
    "fee_currency"      TEXT,
    "skill_level_min"   DECIMAL(5,3),
    "skill_level_max"   DECIMAL(5,3),
    "notes"             TEXT,
    "lifecycle_state"   TEXT NOT NULL DEFAULT 'active',
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_series_pkey" PRIMARY KEY ("id")
);

-- 2. Add FK from session_series to app_clubs
DO $$ BEGIN
  ALTER TABLE "session_series"
    ADD CONSTRAINT "session_series_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "app_clubs"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Indexes on session_series
CREATE INDEX IF NOT EXISTS "session_series_club_id_idx"
  ON "session_series" ("club_id");

CREATE INDEX IF NOT EXISTS "session_series_lifecycle_state_idx"
  ON "session_series" ("lifecycle_state");

-- 4. Add series columns to club_sessions
ALTER TABLE "club_sessions"
  ADD COLUMN IF NOT EXISTS "series_id" TEXT;

ALTER TABLE "club_sessions"
  ADD COLUMN IF NOT EXISTS "detached_from_series" BOOLEAN NOT NULL DEFAULT false;

-- 5. Add FK from club_sessions to session_series
DO $$ BEGIN
  ALTER TABLE "club_sessions"
    ADD CONSTRAINT "club_sessions_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "session_series"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Index on club_sessions.series_id
CREATE INDEX IF NOT EXISTS "club_sessions_series_id_idx"
  ON "club_sessions" ("series_id");
