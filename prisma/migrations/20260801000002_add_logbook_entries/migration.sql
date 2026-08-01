-- Migration: add logbook_entries table
-- Idempotent: uses IF NOT EXISTS so it is safe to re-run.

CREATE TABLE IF NOT EXISTS "logbook_entries" (
  "id"               TEXT         NOT NULL,
  "profile_id"       TEXT         NOT NULL,
  "sport_id"         TEXT         NOT NULL,
  "date"             TEXT         NOT NULL,
  "hours"            DOUBLE PRECISION NOT NULL,
  "session_type"     TEXT         NOT NULL,
  "location"         TEXT         NOT NULL,
  "training_focus"   JSONB        NOT NULL,
  "difficulty"       JSONB        NOT NULL,
  "feeling"          INTEGER      NOT NULL,
  "notes"            TEXT,
  "exercise_details" JSONB,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "logbook_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logbook_entries_profile_id_fkey"
    FOREIGN KEY ("profile_id")
    REFERENCES "player_profiles"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "logbook_entries_profile_id_date_idx"
  ON "logbook_entries"("profile_id", "date");
