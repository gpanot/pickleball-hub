-- CreateTable: club_session_costs
-- One row per category per session. Upsert by @@unique([session_id, category]).
CREATE TABLE IF NOT EXISTS "club_session_costs" (
    "id"         TEXT         NOT NULL,
    "session_id" TEXT         NOT NULL,
    "category"   TEXT         NOT NULL,
    "amount"     DECIMAL(10,2) NOT NULL,
    "currency"   TEXT         NOT NULL,
    "notes"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_session_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "club_session_costs_session_id_idx" ON "club_session_costs"("session_id");

-- CreateUniqueIndex
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'club_session_costs'
    AND indexname = 'club_session_costs_session_id_category_key'
  ) THEN
    CREATE UNIQUE INDEX "club_session_costs_session_id_category_key"
      ON "club_session_costs"("session_id", "category");
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "club_session_costs"
  ADD CONSTRAINT "club_session_costs_session_id_fkey"
  FOREIGN KEY ("session_id")
  REFERENCES "club_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
