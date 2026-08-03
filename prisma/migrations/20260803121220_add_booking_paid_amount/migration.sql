-- AlterTable
ALTER TABLE "club_session_bookings" ADD COLUMN     "paid_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "club_session_costs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "logbook_entries" ALTER COLUMN "updated_at" DROP DEFAULT;
