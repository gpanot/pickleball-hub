-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "clubs" (
    "id" SERIAL NOT NULL,
    "reclub_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sport_id" INTEGER,
    "community_id" INTEGER,
    "num_members" INTEGER NOT NULL DEFAULT 0,
    "zalo_url" TEXT,
    "phone" TEXT,
    "admins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "reference_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "club_id" INTEGER NOT NULL,
    "venue_id" INTEGER,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "max_players" INTEGER NOT NULL,
    "fee_amount" INTEGER NOT NULL DEFAULT 0,
    "fee_currency" TEXT NOT NULL DEFAULT 'VND',
    "cost_per_hour" DOUBLE PRECISION,
    "privacy" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'active',
    "skill_level_min" DOUBLE PRECISION,
    "skill_level_max" DOUBLE PRECISION,
    "perks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "event_url" TEXT NOT NULL,
    "scraped_date" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_snapshots" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined" INTEGER NOT NULL DEFAULT 0,
    "waitlisted" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "club_id" INTEGER,
    "venue_id" INTEGER,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_daily_stats" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "total_sessions" INTEGER NOT NULL DEFAULT 0,
    "total_capacity" INTEGER NOT NULL DEFAULT 0,
    "total_joined" INTEGER NOT NULL DEFAULT 0,
    "avg_fill_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue_estimate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "club_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clubs_reclub_id_key" ON "clubs"("reclub_id");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE INDEX "venues_latitude_longitude_idx" ON "venues"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "sessions_scraped_date_idx" ON "sessions"("scraped_date");

-- CreateIndex
CREATE INDEX "sessions_club_id_idx" ON "sessions"("club_id");

-- CreateIndex
CREATE INDEX "sessions_venue_id_idx" ON "sessions"("venue_id");

-- CreateIndex
CREATE INDEX "sessions_start_time_idx" ON "sessions"("start_time");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_reference_code_scraped_date_key" ON "sessions"("reference_code", "scraped_date");

-- CreateIndex
CREATE INDEX "daily_snapshots_session_id_idx" ON "daily_snapshots"("session_id");

-- CreateIndex
CREATE INDEX "daily_snapshots_scraped_at_idx" ON "daily_snapshots"("scraped_at");

-- CreateIndex
CREATE UNIQUE INDEX "access_codes_code_key" ON "access_codes"("code");

-- CreateIndex
CREATE INDEX "club_daily_stats_date_idx" ON "club_daily_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "club_daily_stats_club_id_date_key" ON "club_daily_stats"("club_id", "date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_snapshots" ADD CONSTRAINT "daily_snapshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_daily_stats" ADD CONSTRAINT "club_daily_stats_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

