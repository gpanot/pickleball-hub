import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/club-sessions/[id]/cancel-preview
 *
 * Returns the number of future sessions and affected bookings that would be
 * cancelled if ENTIRE_SERIES scope is used. Read-only — no state change.
 * Used by the mobile scope sheet to show the confirmation dialog.
 *
 * Auth: any manager.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await prisma.clubSession.findUnique({
    where: { id },
    select: { appClubId: true, seriesId: true, lifecycleState: true },
  });

  if (!session || session.lifecycleState === "deleted") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const authorized = await isClubManager(session.appClubId, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!session.seriesId) {
    return NextResponse.json({ futureSessions: 0, affectedBookings: 0 });
  }

  const now = new Date();

  const [futureSessions, affectedBookings] = await Promise.all([
    prisma.clubSession.count({
      where: {
        seriesId: session.seriesId,
        detachedFromSeries: false,
        lifecycleState: { in: ["published", "draft"] },
        startTime: { gt: now },
      },
    }),
    prisma.clubSessionBooking.count({
      where: {
        clubSession: {
          seriesId: session.seriesId,
          detachedFromSeries: false,
          lifecycleState: { in: ["published", "draft"] },
          startTime: { gt: now },
        },
        status: { in: ["confirmed", "waiting_list"] },
      },
    }),
  ]);

  return NextResponse.json({ futureSessions, affectedBookings });
}
