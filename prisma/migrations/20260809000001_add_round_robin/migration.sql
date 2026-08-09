-- AddRoundRobin
-- Creates tables for the Round Robin tournament engine.
-- All tables use UUID PKs and cascade on session/tournament deletion.
-- Raw SQL only — rr_* tables are not modelled in schema.prisma.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS rr_tournaments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     TEXT        NOT NULL REFERENCES "club_sessions"(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'draw_created'
                               CHECK (status IN ('pending','draw_created','active','complete')),
  total_rounds   INT         NOT NULL,
  current_round  INT         NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rr_tournaments_session_id_idx ON rr_tournaments(session_id);

CREATE TABLE IF NOT EXISTS rr_participants (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID  NOT NULL REFERENCES rr_tournaments(id) ON DELETE CASCADE,
  player_profile_id TEXT  NOT NULL,
  display_name      TEXT  NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rr_participants_tournament_idx ON rr_participants(tournament_id);

CREATE TABLE IF NOT EXISTS rr_rounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES rr_tournaments(id) ON DELETE CASCADE,
  round_number  INT  NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, round_number)
);

CREATE INDEX IF NOT EXISTS rr_rounds_tournament_idx ON rr_rounds(tournament_id);

CREATE TABLE IF NOT EXISTS rr_matches (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      UUID    NOT NULL REFERENCES rr_rounds(id) ON DELETE CASCADE,
  tournament_id UUID    NOT NULL REFERENCES rr_tournaments(id) ON DELETE CASCADE,
  court_number  INT     NOT NULL,
  is_bye        BOOLEAN NOT NULL DEFAULT FALSE,
  score_team1   INT,
  score_team2   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rr_matches_round_idx       ON rr_matches(round_id);
CREATE INDEX IF NOT EXISTS rr_matches_tournament_idx  ON rr_matches(tournament_id);

CREATE TABLE IF NOT EXISTS rr_match_players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       UUID NOT NULL REFERENCES rr_matches(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES rr_participants(id) ON DELETE CASCADE,
  team           INT  NOT NULL CHECK (team IN (1, 2)),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, participant_id)
);

CREATE INDEX IF NOT EXISTS rr_match_players_match_idx ON rr_match_players(match_id);
