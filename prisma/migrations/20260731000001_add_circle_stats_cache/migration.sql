-- AddColumn circle_stats_cache + circle_stats_cached_at to player_profiles
ALTER TABLE "player_profiles"
  ADD COLUMN IF NOT EXISTS "circle_stats_cache" JSONB,
  ADD COLUMN IF NOT EXISTS "circle_stats_cached_at" TIMESTAMP(3);
