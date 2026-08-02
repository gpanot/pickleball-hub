-- AddAutoGrowCapacity
-- Adds four columns to club_sessions for host-configured tiered capacity auto-promotion.
-- All existing rows default to auto_grow_enabled = false with nullable base/ceiling columns.

ALTER TABLE "club_sessions"
  ADD COLUMN IF NOT EXISTS "auto_grow_enabled"  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "base_capacity"       INTEGER,
  ADD COLUMN IF NOT EXISTS "capacity_ceiling"    INTEGER,
  ADD COLUMN IF NOT EXISTS "capacity_tier_step"  INTEGER NOT NULL DEFAULT 4;
