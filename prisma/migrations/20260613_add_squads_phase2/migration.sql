-- Phase 2: Squad Chests, XP Log, City, Streak

-- Extend squads table
ALTER TABLE "squads" ADD COLUMN "city" TEXT NOT NULL DEFAULT 'hcm';
ALTER TABLE "squads" ADD COLUMN "streak_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "squads" ADD COLUMN "streak_last_updated" DATE;

-- Squad Chests
CREATE TABLE "squad_chests" (
    "id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "earner_id" TEXT NOT NULL,
    "session_id" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'checkin',
    "venue_name" TEXT,
    "checkin_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "squad_chests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "squad_chests_squad_id_earner_id_checkin_date_key" ON "squad_chests"("squad_id", "earner_id", "checkin_date");
CREATE INDEX "idx_squad_chests_squad" ON "squad_chests"("squad_id");
CREATE INDEX "idx_squad_chests_expires" ON "squad_chests"("expires_at");

ALTER TABLE "squad_chests" ADD CONSTRAINT "squad_chests_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "squad_chests" ADD CONSTRAINT "squad_chests_earner_id_fkey" FOREIGN KEY ("earner_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Squad Chest Openings
CREATE TABLE "squad_chest_openings" (
    "id" SERIAL NOT NULL,
    "chest_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tapped_at" TIMESTAMPTZ,
    "unlocks_at" TIMESTAMPTZ,
    "opened_at" TIMESTAMPTZ,
    "kudos_awarded" INTEGER,
    "xp_awarded" INTEGER,

    CONSTRAINT "squad_chest_openings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "squad_chest_openings_chest_id_profile_id_key" ON "squad_chest_openings"("chest_id", "profile_id");
CREATE INDEX "idx_chest_openings_chest" ON "squad_chest_openings"("chest_id");
CREATE INDEX "idx_chest_openings_profile" ON "squad_chest_openings"("profile_id");
CREATE INDEX "idx_chest_openings_unlocks" ON "squad_chest_openings"("unlocks_at");

ALTER TABLE "squad_chest_openings" ADD CONSTRAINT "squad_chest_openings_chest_id_fkey" FOREIGN KEY ("chest_id") REFERENCES "squad_chests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "squad_chest_openings" ADD CONSTRAINT "squad_chest_openings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Squad XP Log
CREATE TABLE "squad_xp_log" (
    "id" SERIAL NOT NULL,
    "squad_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "source" TEXT NOT NULL,
    "xp_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_xp_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_xp_log_squad" ON "squad_xp_log"("squad_id");
CREATE INDEX "idx_xp_log_created" ON "squad_xp_log"("created_at");

ALTER TABLE "squad_xp_log" ADD CONSTRAINT "squad_xp_log_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
