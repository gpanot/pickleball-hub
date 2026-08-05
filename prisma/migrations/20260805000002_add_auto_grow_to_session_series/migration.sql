-- AddAutoGrowToSessionSeries
-- Adds auto-grow fields to the session_series template table so that newly
-- materialised occurrences inherit the host's auto-grow configuration.

ALTER TABLE "session_series"
  ADD COLUMN IF NOT EXISTS "auto_grow_enabled"  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "min_capacity"        INTEGER,
  ADD COLUMN IF NOT EXISTS "capacity_ceiling"    INTEGER,
  ADD COLUMN IF NOT EXISTS "capacity_tier_step"  INTEGER NOT NULL DEFAULT 4;
