-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "public"."player_club_ranks" (
    "id"              SERIAL PRIMARY KEY,
    "user_id"         BIGINT NOT NULL,
    "app_club_id"     UUID NOT NULL,
    "weighted_score"  INT NOT NULL DEFAULT 0,
    "session_count"   INT NOT NULL DEFAULT 0,
    "last_session_at" TIMESTAMPTZ,
    "rank"            INT,
    "updated_at"      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "player_club_ranks_user_id_app_club_id_key" UNIQUE ("user_id", "app_club_id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "idx_player_club_ranks_user" ON "public"."player_club_ranks" ("user_id", "weighted_score" DESC);
