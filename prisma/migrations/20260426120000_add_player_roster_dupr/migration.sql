-- CreateTable
CREATE TABLE "players" (
    "user_id" BIGINT NOT NULL,
    "username" TEXT,
    "display_name" TEXT,
    "dupr_singles" DECIMAL(5,3),
    "dupr_doubles" DECIMAL(5,3),
    "dupr_singles_reliability" INTEGER,
    "dupr_doubles_reliability" INTEGER,
    "dupr_id" TEXT,
    "dupr_updated_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "session_rosters" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "user_id" BIGINT NOT NULL,
    "is_host" BOOLEAN NOT NULL DEFAULT false,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT true,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_dupr_stats" (
    "session_id" INTEGER NOT NULL,
    "scraped_date" TEXT NOT NULL,
    "total_confirmed" INTEGER NOT NULL DEFAULT 0,
    "players_with_dupr" INTEGER NOT NULL DEFAULT 0,
    "dupr_participation_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "avg_dupr_singles" DECIMAL(5,3),
    "avg_dupr_doubles" DECIMAL(5,3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_dupr_stats_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_rosters_session_id_user_id_key" ON "session_rosters"("session_id", "user_id");

-- CreateIndex
CREATE INDEX "session_rosters_session_id_idx" ON "session_rosters"("session_id");

-- CreateIndex
CREATE INDEX "session_rosters_user_id_idx" ON "session_rosters"("user_id");

-- AddForeignKey
ALTER TABLE "session_rosters" ADD CONSTRAINT "session_rosters_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_rosters" ADD CONSTRAINT "session_rosters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "players"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_dupr_stats" ADD CONSTRAINT "session_dupr_stats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
