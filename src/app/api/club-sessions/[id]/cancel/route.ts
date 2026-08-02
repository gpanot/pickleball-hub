import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { can } from "@/lib/club-permissions";
import { prisma } from "@/lib/db";
import { notifySessionCancelled } from "@/lib/club-session-notifications";

/**
 * POST /api/club-sessions/[id]/cancel
 * Body: { scope: "THIS_OCCURRENCE" | "ENTIRE_SERIES" }
 *
 * THIS_OCCURRENCE — cancel this session only, detach from series.
 *   Auth: any manager.
 *
 * ENTIRE_SERIES — cancel the series and all future non-detached occurrences.
 *   Auth: Owner only (CANCEL_SERIES permission).
 *   Returns { cancelledOccurrences: N, notifiedBookings: M }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { scope?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { scope } = body;
  if (scope !== "THIS_OCCURRENCE" && scope !== "ENTIRE_SERIES") {
    return NextResponse.json(
      { error: "scope must be 'THIS_OCCURRENCE' or 'ENTIRE_SERIES'" },
      { status: 400 },
    );
  }

  const session = await prisma.clubSession.findUnique({
    where: { id },
    select: {
      id: true,
      appClubId: true,
      name: true,
      lifecycleState: true,
      seriesId: true,
      detachedFromSeries: true,
    },
  });

  if (!session || session.lifecycleState === "deleted") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Auth: any manager can cancel a single occurrence; only Owner can cancel the series
  const authorized = await isClubManager(session.appClubId, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── THIS_OCCURRENCE ──────────────────────────────────────────────────────────
  if (scope === "THIS_OCCURRENCE") {
    if (session.lifecycleState === "cancelled") {
      return NextResponse.json({ error: "Session is already cancelled" }, { status: 409 });
    }

    await prisma.clubSession.update({
      where: { id },
      data: { lifecycleState: "cancelled", detachedFromSeries: true },
    });

    void notifySessionCancelled({
      sessionId: id,
      sessionName: session.name,
      hostProfileId: user.profileId,
    });

    return NextResponse.json({ ok: true, scope: "THIS_OCCURRENCE" });
  }

  // ── ENTIRE_SERIES ────────────────────────────────────────────────────────────
  if (!session.seriesId) {
    return NextResponse.json(
      { error: "This session does not belong to a series" },
      { status: 400 },
    );
  }

  // Owner-only permission check
  const canCancelSeries = await can(user.profileId, session.appClubId, "CANCEL_SERIES");
  if (!canCancelSeries) {
    return NextResponse.json(
      { error: "Only the club Owner can cancel an entire series" },
      { status: 403 },
    );
  }

  const now = new Date();

  // Find all future non-detached published occurrences
  const futureOccurrences = await prisma.clubSession.findMany({
    where: {
      seriesId: session.seriesId,
      detachedFromSeries: false,
      lifecycleState: "published",
      startTime: { gt: now },
    },
    select: { id: true, name: true },
  });

  // Count affected bookings across all future occurrences
  const affectedBookingCount = await prisma.clubSessionBooking.count({
    where: {
      clubSessionId: { in: futureOccurrences.map((s) => s.id) },
      status: { in: ["confirmed", "waiting_list"] },
    },
  });

  // 1. Cancel the series template
  await prisma.sessionSeries.update({
    where: { id: session.seriesId },
    data: { lifecycleState: "cancelled" },
  });

  // 2. Cancel all future non-detached occurrences in one query
  await prisma.clubSession.updateMany({
    where: {
      seriesId: session.seriesId,
      detachedFromSeries: false,
      lifecycleState: { in: ["published", "draft"] },
      startTime: { gt: now },
    },
    data: { lifecycleState: "cancelled" },
  });

  // 3. Notify bookings on each cancelled occurrence (fire-and-forget, one per occurrence)
  for (const occurrence of futureOccurrences) {
    void notifySessionCancelled({
      sessionId: occurrence.id,
      sessionName: occurrence.name,
      hostProfileId: user.profileId,
    });
  }

  return NextResponse.json({
    ok: true,
    scope: "ENTIRE_SERIES",
    cancelledOccurrences: futureOccurrences.length,
    notifiedBookings: affectedBookingCount,
  });
}
