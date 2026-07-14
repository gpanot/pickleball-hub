-- Performance indexes for the heatmap 90-day aggregation query.
-- Both are safe to run on a live database (IF NOT EXISTS guard).

CREATE INDEX IF NOT EXISTS session_rosters_is_confirmed_session_id_idx
  ON session_rosters (is_confirmed, session_id);

CREATE INDEX IF NOT EXISTS sessions_scraped_date_venue_id_club_id_idx
  ON sessions (scraped_date, venue_id, club_id);
