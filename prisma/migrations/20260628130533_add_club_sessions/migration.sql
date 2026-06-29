-- DropForeignKey
ALTER TABLE "pods" DROP CONSTRAINT "pods_squad_id_fkey";

-- CreateTable
CREATE TABLE "app_clubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sport_id" INTEGER,
    "privacy" TEXT NOT NULL DEFAULT 'public',
    "level" TEXT,
    "auto_approve_new_members" BOOLEAN NOT NULL DEFAULT true,
    "creator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_club_managers" (
    "id" TEXT NOT NULL,
    "app_club_id" TEXT NOT NULL,
    "player_profile_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'manager',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by_id" TEXT NOT NULL,

    CONSTRAINT "app_club_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_club_members" (
    "id" TEXT NOT NULL,
    "app_club_id" TEXT NOT NULL,
    "player_profile_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_club_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_sessions" (
    "id" TEXT NOT NULL,
    "app_club_id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "sport_id" INTEGER,
    "format" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "venue_id" INTEGER,
    "venue_pending" BOOLEAN NOT NULL DEFAULT false,
    "max_players" INTEGER NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "privacy" TEXT NOT NULL DEFAULT 'public',
    "fee_amount" DECIMAL(10,2),
    "fee_currency" TEXT,
    "skill_level_min" DECIMAL(5,3),
    "skill_level_max" DECIMAL(5,3),
    "host_role" TEXT NOT NULL DEFAULT 'host_and_play',
    "notes" TEXT,
    "lifecycle_state" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_session_bookings" (
    "id" TEXT NOT NULL,
    "player_profile_id" TEXT NOT NULL,
    "club_session_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "paid_status" BOOLEAN NOT NULL DEFAULT false,
    "attendance_status" TEXT NOT NULL DEFAULT 'unmarked',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_session_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_clubs_creator_id_key" ON "app_clubs"("creator_id");

-- CreateIndex
CREATE INDEX "app_clubs_privacy_idx" ON "app_clubs"("privacy");

-- CreateIndex
CREATE INDEX "app_club_managers_player_profile_id_idx" ON "app_club_managers"("player_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_club_managers_app_club_id_player_profile_id_key" ON "app_club_managers"("app_club_id", "player_profile_id");

-- CreateIndex
CREATE INDEX "app_club_members_player_profile_id_idx" ON "app_club_members"("player_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_club_members_app_club_id_player_profile_id_key" ON "app_club_members"("app_club_id", "player_profile_id");

-- CreateIndex
CREATE INDEX "club_sessions_app_club_id_start_time_idx" ON "club_sessions"("app_club_id", "start_time");

-- CreateIndex
CREATE INDEX "club_sessions_lifecycle_state_start_time_idx" ON "club_sessions"("lifecycle_state", "start_time");

-- CreateIndex
CREATE INDEX "club_sessions_venue_id_idx" ON "club_sessions"("venue_id");

-- CreateIndex
CREATE INDEX "club_session_bookings_club_session_id_status_idx" ON "club_session_bookings"("club_session_id", "status");

-- CreateIndex
CREATE INDEX "club_session_bookings_player_profile_id_idx" ON "club_session_bookings"("player_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "club_session_bookings_player_profile_id_club_session_id_key" ON "club_session_bookings"("player_profile_id", "club_session_id");

-- AddForeignKey
ALTER TABLE "pods" ADD CONSTRAINT "pods_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_clubs" ADD CONSTRAINT "app_clubs_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_club_managers" ADD CONSTRAINT "app_club_managers_app_club_id_fkey" FOREIGN KEY ("app_club_id") REFERENCES "app_clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_club_managers" ADD CONSTRAINT "app_club_managers_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_club_managers" ADD CONSTRAINT "app_club_managers_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_club_members" ADD CONSTRAINT "app_club_members_app_club_id_fkey" FOREIGN KEY ("app_club_id") REFERENCES "app_clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_club_members" ADD CONSTRAINT "app_club_members_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_sessions" ADD CONSTRAINT "club_sessions_app_club_id_fkey" FOREIGN KEY ("app_club_id") REFERENCES "app_clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_sessions" ADD CONSTRAINT "club_sessions_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_sessions" ADD CONSTRAINT "club_sessions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_session_bookings" ADD CONSTRAINT "club_session_bookings_player_profile_id_fkey" FOREIGN KEY ("player_profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_session_bookings" ADD CONSTRAINT "club_session_bookings_club_session_id_fkey" FOREIGN KEY ("club_session_id") REFERENCES "club_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
