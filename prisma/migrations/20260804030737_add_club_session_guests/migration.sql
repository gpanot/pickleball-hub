-- CreateTable
CREATE TABLE "club_session_guests" (
    "id" TEXT NOT NULL,
    "club_session_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "booked_by_profile_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "skill_level_label" TEXT NOT NULL,
    "skill_level_value" DECIMAL(5,3),
    "added_by" TEXT NOT NULL DEFAULT 'player',
    "paid_status" BOOLEAN NOT NULL DEFAULT false,
    "paid_amount" DECIMAL(12,2),
    "attendance_status" TEXT NOT NULL DEFAULT 'unmarked',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_session_guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_session_guests_club_session_id_idx" ON "club_session_guests"("club_session_id");

-- CreateIndex
CREATE INDEX "club_session_guests_booking_id_idx" ON "club_session_guests"("booking_id");

-- AddForeignKey
ALTER TABLE "club_session_guests" ADD CONSTRAINT "club_session_guests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "club_session_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_session_guests" ADD CONSTRAINT "club_session_guests_club_session_id_fkey" FOREIGN KEY ("club_session_id") REFERENCES "club_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
