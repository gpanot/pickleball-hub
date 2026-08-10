-- migrate:up
CREATE TABLE IF NOT EXISTS player_club_ranks (
  id              SERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  app_club_id     UUID NOT NULL,
  weighted_score  INT NOT NULL DEFAULT 0,
  session_count   INT NOT NULL DEFAULT 0,
  last_session_at TIMESTAMP WITH TIME ZONE,
  rank            INT,
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, app_club_id)
);

CREATE INDEX IF NOT EXISTS idx_player_club_ranks_user ON player_club_ranks (user_id, weighted_score DESC);

-- migrate:down
DROP TABLE IF EXISTS player_club_ranks;
