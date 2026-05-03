-- CreateTable
CREATE TABLE "ai_chat_settings" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "context_hours" INTEGER NOT NULL DEFAULT 48,
    "max_sessions" INTEGER NOT NULL DEFAULT 200,
    "max_venues" INTEGER NOT NULL DEFAULT 20,
    "max_clubs" INTEGER NOT NULL DEFAULT 20,
    "max_cost_per_message_usd" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "daily_cost_alert_usd" DOUBLE PRECISION NOT NULL DEFAULT 5.00,
    "player_facing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "ai_chat_settings_pkey" PRIMARY KEY ("id")
);
