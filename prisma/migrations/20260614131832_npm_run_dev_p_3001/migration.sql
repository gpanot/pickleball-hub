-- AlterTable
ALTER TABLE "squad_chest_openings" ALTER COLUMN "tapped_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "unlocks_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "opened_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "squad_chests" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "squad_xp_log" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "radar_sessions" (
    "id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auto_ends_at" TIMESTAMP(3) NOT NULL,
    "stopped_at" TIMESTAMP(3),
    "is_clash_active" BOOLEAN NOT NULL DEFAULT false,
    "clash_partner_squad_id" TEXT,
    "inf_base" INTEGER,
    "inf_final" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "radar_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_battles" (
    "id" TEXT NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "initiating_squad_id" TEXT NOT NULL,
    "rival_squad_id" TEXT NOT NULL,
    "initiating_card_power" INTEGER NOT NULL,
    "rival_card_power" INTEGER NOT NULL,
    "winner_squad_id" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reveal_at" TIMESTAMP(3) NOT NULL,
    "counter_attack_window_ends_at" TIMESTAMP(3) NOT NULL,
    "battle_number" INTEGER NOT NULL DEFAULT 1,
    "is_counter_attack" BOOLEAN NOT NULL DEFAULT false,
    "parent_battle_id" TEXT,

    CONSTRAINT "card_battles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_inf_totals" (
    "squad_id" TEXT NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "total_inf" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_inf_totals_pkey" PRIMARY KEY ("squad_id","venue_id")
);

-- CreateTable
CREATE TABLE "venue_pulse_cooldowns" (
    "player_id" TEXT NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "last_pulse_at" TIMESTAMP(3) NOT NULL,
    "cooldown_ends_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_pulse_cooldowns_pkey" PRIMARY KEY ("player_id","venue_id")
);

-- CreateTable
CREATE TABLE "squad_card_state" (
    "squad_id" TEXT NOT NULL,
    "card_power_inf" INTEGER NOT NULL,
    "card_level_multiplier" DECIMAL(4,2) NOT NULL,
    "venues_owned_count" INTEGER NOT NULL DEFAULT 0,
    "active_members_this_week" INTEGER NOT NULL DEFAULT 0,
    "last_computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_card_state_pkey" PRIMARY KEY ("squad_id")
);

-- CreateTable
CREATE TABLE "squad_alerts" (
    "id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "recipient_profile_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radar_sessions_venue_id_state_idx" ON "radar_sessions"("venue_id", "state");

-- CreateIndex
CREATE INDEX "radar_sessions_squad_id_state_idx" ON "radar_sessions"("squad_id", "state");

-- CreateIndex
CREATE INDEX "radar_sessions_player_id_state_idx" ON "radar_sessions"("player_id", "state");

-- CreateIndex
CREATE INDEX "radar_sessions_auto_ends_at_state_idx" ON "radar_sessions"("auto_ends_at", "state");

-- CreateIndex
CREATE INDEX "card_battles_venue_id_initiated_at_idx" ON "card_battles"("venue_id", "initiated_at");

-- CreateIndex
CREATE INDEX "card_battles_initiating_squad_id_idx" ON "card_battles"("initiating_squad_id");

-- CreateIndex
CREATE INDEX "card_battles_rival_squad_id_idx" ON "card_battles"("rival_squad_id");

-- CreateIndex
CREATE INDEX "venue_inf_totals_venue_id_total_inf_idx" ON "venue_inf_totals"("venue_id", "total_inf" DESC);

-- CreateIndex
CREATE INDEX "squad_alerts_recipient_profile_id_read_at_idx" ON "squad_alerts"("recipient_profile_id", "read_at");

-- CreateIndex
CREATE INDEX "squad_alerts_squad_id_created_at_idx" ON "squad_alerts"("squad_id", "created_at");

-- AddForeignKey
ALTER TABLE "radar_sessions" ADD CONSTRAINT "radar_sessions_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_sessions" ADD CONSTRAINT "radar_sessions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_sessions" ADD CONSTRAINT "radar_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_battles" ADD CONSTRAINT "card_battles_initiating_squad_id_fkey" FOREIGN KEY ("initiating_squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_battles" ADD CONSTRAINT "card_battles_rival_squad_id_fkey" FOREIGN KEY ("rival_squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_battles" ADD CONSTRAINT "card_battles_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_inf_totals" ADD CONSTRAINT "venue_inf_totals_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_inf_totals" ADD CONSTRAINT "venue_inf_totals_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_pulse_cooldowns" ADD CONSTRAINT "venue_pulse_cooldowns_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_pulse_cooldowns" ADD CONSTRAINT "venue_pulse_cooldowns_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_card_state" ADD CONSTRAINT "squad_card_state_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_alerts" ADD CONSTRAINT "squad_alerts_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_alerts" ADD CONSTRAINT "squad_alerts_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_chest_openings_chest" RENAME TO "squad_chest_openings_chest_id_idx";

-- RenameIndex
ALTER INDEX "idx_chest_openings_profile" RENAME TO "squad_chest_openings_profile_id_idx";

-- RenameIndex
ALTER INDEX "idx_chest_openings_unlocks" RENAME TO "squad_chest_openings_unlocks_at_idx";

-- RenameIndex
ALTER INDEX "idx_squad_chests_expires" RENAME TO "squad_chests_expires_at_idx";

-- RenameIndex
ALTER INDEX "idx_squad_chests_squad" RENAME TO "squad_chests_squad_id_idx";

-- RenameIndex
ALTER INDEX "idx_xp_log_created" RENAME TO "squad_xp_log_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_xp_log_squad" RENAME TO "squad_xp_log_squad_id_idx";
