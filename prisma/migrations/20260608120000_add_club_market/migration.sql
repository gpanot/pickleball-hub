-- Add market column to clubs table.
-- 'hcm' = Ho Chi Minh City (Vietnam), 'kl' = Kuala Lumpur (Malaysia).
-- Default 'hcm' so all existing rows are automatically classified as Vietnam.
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT 'hcm';

-- Index for fast market-scoped queries on sessions (via club join) and clubs listing.
CREATE INDEX IF NOT EXISTS "clubs_market_idx" ON "clubs"("market");
