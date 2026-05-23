-- AlterTable: add push notification fields to player_profiles
ALTER TABLE "player_profiles" ADD COLUMN "push_token" TEXT;
ALTER TABLE "player_profiles" ADD COLUMN "push_token_updated_at" TIMESTAMPTZ;
ALTER TABLE "player_profiles" ADD COLUMN "last_active_at" TIMESTAMPTZ;

-- CreateTable: notifications_sent
CREATE TABLE "notifications_sent" (
    "id" SERIAL NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "type" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_sent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_sent_recipient_id_type_sent_at_idx" ON "notifications_sent"("recipient_id", "type", "sent_at");

-- AddForeignKey
ALTER TABLE "notifications_sent" ADD CONSTRAINT "notifications_sent_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_sent" ADD CONSTRAINT "notifications_sent_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
