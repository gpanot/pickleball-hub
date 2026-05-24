CREATE TABLE IF NOT EXISTS kudos (
  id SERIAL PRIMARY KEY,
  from_player_id TEXT NOT NULL,
  to_player_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fistbump', 'flame', 'star')),
  feed_item_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_player_id, to_player_id, type, feed_item_id)
);
CREATE INDEX IF NOT EXISTS kudos_to_idx ON kudos (to_player_id, type);
CREATE INDEX IF NOT EXISTS kudos_from_idx ON kudos (from_player_id, created_at);
