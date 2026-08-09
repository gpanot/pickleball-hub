-- migrate:up

-- ── Round Robin tournament tables ─────────────────────────────────────────────
-- One tournament per club_session (UNIQUE on session_id).
-- Status lifecycle: pending → draw_created → active → complete

CREATE TABLE IF NOT EXISTS public.rr_tournaments (
    id              uuid    NOT NULL DEFAULT gen_random_uuid(),
    session_id      text    NOT NULL,
    status          text    NOT NULL DEFAULT 'pending',
    current_round   integer NOT NULL DEFAULT 0,
    total_rounds    integer NOT NULL DEFAULT 0,
    created_at      timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at      timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT rr_tournaments_pkey PRIMARY KEY (id),
    CONSTRAINT rr_tournaments_session_id_fkey FOREIGN KEY (session_id)
        REFERENCES public.club_sessions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS rr_tournaments_session_id_key
    ON public.rr_tournaments(session_id);
CREATE INDEX IF NOT EXISTS rr_tournaments_status_idx
    ON public.rr_tournaments(status);

-- ── Participant snapshot ───────────────────────────────────────────────────────
-- Frozen at draw time from confirmed bookings.

CREATE TABLE IF NOT EXISTS public.rr_participants (
    id                  uuid    NOT NULL DEFAULT gen_random_uuid(),
    tournament_id       uuid    NOT NULL,
    player_profile_id   text    NOT NULL,
    display_name        text    NOT NULL,
    created_at          timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT rr_participants_pkey PRIMARY KEY (id),
    CONSTRAINT rr_participants_tournament_id_fkey FOREIGN KEY (tournament_id)
        REFERENCES public.rr_tournaments(id) ON DELETE CASCADE,
    CONSTRAINT rr_participants_player_profile_id_fkey FOREIGN KEY (player_profile_id)
        REFERENCES public.player_profiles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS rr_participants_tournament_player_key
    ON public.rr_participants(tournament_id, player_profile_id);
CREATE INDEX IF NOT EXISTS rr_participants_tournament_id_idx
    ON public.rr_participants(tournament_id);

-- ── Rounds ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rr_rounds (
    id              uuid    NOT NULL DEFAULT gen_random_uuid(),
    tournament_id   uuid    NOT NULL,
    round_number    integer NOT NULL,
    created_at      timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT rr_rounds_pkey PRIMARY KEY (id),
    CONSTRAINT rr_rounds_tournament_id_fkey FOREIGN KEY (tournament_id)
        REFERENCES public.rr_tournaments(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS rr_rounds_tournament_round_key
    ON public.rr_rounds(tournament_id, round_number);
CREATE INDEX IF NOT EXISTS rr_rounds_tournament_id_idx
    ON public.rr_rounds(tournament_id);

-- ── Matches ────────────────────────────────────────────────────────────────────
-- is_bye = true → one "team" sits out (only team1 players are real; team2 is empty).

CREATE TABLE IF NOT EXISTS public.rr_matches (
    id              uuid    NOT NULL DEFAULT gen_random_uuid(),
    round_id        uuid    NOT NULL,
    tournament_id   uuid    NOT NULL,
    court_number    integer NOT NULL DEFAULT 1,
    is_bye          boolean NOT NULL DEFAULT false,
    score_team1     integer,
    score_team2     integer,
    created_at      timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at      timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT rr_matches_pkey PRIMARY KEY (id),
    CONSTRAINT rr_matches_round_id_fkey FOREIGN KEY (round_id)
        REFERENCES public.rr_rounds(id) ON DELETE CASCADE,
    CONSTRAINT rr_matches_tournament_id_fkey FOREIGN KEY (tournament_id)
        REFERENCES public.rr_tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS rr_matches_round_id_idx
    ON public.rr_matches(round_id);
CREATE INDEX IF NOT EXISTS rr_matches_tournament_id_idx
    ON public.rr_matches(tournament_id);

-- ── Match players ──────────────────────────────────────────────────────────────
-- Up to 4 rows per match (2 per team). 1 or 2 rows for bye matches (team 1 only).

CREATE TABLE IF NOT EXISTS public.rr_match_players (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    match_id        uuid        NOT NULL,
    participant_id  uuid        NOT NULL,
    team            smallint    NOT NULL,
    created_at      timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT rr_match_players_pkey PRIMARY KEY (id),
    CONSTRAINT rr_match_players_match_id_fkey FOREIGN KEY (match_id)
        REFERENCES public.rr_matches(id) ON DELETE CASCADE,
    CONSTRAINT rr_match_players_participant_id_fkey FOREIGN KEY (participant_id)
        REFERENCES public.rr_participants(id) ON DELETE CASCADE,
    CONSTRAINT rr_match_players_team_check CHECK (team IN (1, 2))
);

CREATE UNIQUE INDEX IF NOT EXISTS rr_match_players_match_participant_key
    ON public.rr_match_players(match_id, participant_id);
CREATE INDEX IF NOT EXISTS rr_match_players_match_id_idx
    ON public.rr_match_players(match_id);
CREATE INDEX IF NOT EXISTS rr_match_players_participant_id_idx
    ON public.rr_match_players(participant_id);

-- migrate:down

DROP TABLE IF EXISTS public.rr_match_players;
DROP TABLE IF EXISTS public.rr_matches;
DROP TABLE IF EXISTS public.rr_rounds;
DROP TABLE IF EXISTS public.rr_participants;
DROP TABLE IF EXISTS public.rr_tournaments;
