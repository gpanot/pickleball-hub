-- CreateTable
CREATE TABLE "player_dupr_history" (
    "id" SERIAL NOT NULL,
    "player_id" BIGINT NOT NULL,
    "dupr_doubles" DECIMAL(5,3),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'scraper',

    CONSTRAINT "player_dupr_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_dupr_history_player_id_recorded_at_idx" ON "player_dupr_history"("player_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "player_dupr_history" ADD CONSTRAINT "player_dupr_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
