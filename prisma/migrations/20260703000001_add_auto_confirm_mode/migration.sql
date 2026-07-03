-- Add auto_confirm_mode to club_sessions
-- "open" | "auto_confirm_till_full" | "requires_approval"
-- Default "open" preserves all existing session behaviour.
ALTER TABLE "club_sessions"
  ADD COLUMN IF NOT EXISTS "auto_confirm_mode" TEXT NOT NULL DEFAULT 'open';
