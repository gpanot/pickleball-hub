-- CreateTable
CREATE TABLE "admin_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "llm_model" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 1000,
    "monthly_budget_usd" DOUBLE PRECISION NOT NULL DEFAULT 5.00,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage_logs" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "post_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_usage_logs_created_at_idx" ON "llm_usage_logs"("created_at");
