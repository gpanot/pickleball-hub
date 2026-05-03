-- CreateTable
CREATE TABLE "ai_assistant_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_assistant_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_assistant_logs_session_id_idx" ON "ai_assistant_logs"("session_id");

-- CreateIndex
CREATE INDEX "ai_assistant_logs_created_at_idx" ON "ai_assistant_logs"("created_at");
