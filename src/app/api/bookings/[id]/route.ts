/**
 * PATCH /api/bookings/[id] — booking state machine (Phase 3)
 *
 * Handles:
 *  - Status transitions (host-only): requested/waiting_list/confirmed/declined
 *    Any transition is host-reversible at any time.
 *  - Player self-cancel: a player can move their own confirmed/requested/waiting_list
 *    booking to "declined" (i.e. cancel their spot).
 *  - Soft capacity: confirming past maxPlayers is never blocked.
 *  - Waitlist auto-backfill: when a confirmed booking leaves, the longest-waiting
 *    waiting_list player is automatically promoted to confirmed.
 *  - paidStatus toggle (host-only, confirmed bookings only).
 *  - attendanceStatus toggle (host-only, confirmed bookings only).
 *
 * Auth: AppClubManager check for all host actions; own booking for player cancel.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";
import {
  notifyBookingConfirmed,
  notifyBookingWaitingList,
  notifyBookingDeclined,
  notifyAutoBackfill,
  notifyPlayerCancelledToHost,
} from "@/lib/club-session-notifications";

const VALID_STATUSES = ["requested", "confirmed", "waiting_list", "declined"] as const;
type BookingStatus = typeof VALID_STATUSES[number];

const VALID_ATTENDANCE = ["unmarked", "checked_in", "no_show"] as const;

/** Find and promote the longest-waiting waiting_list player. Returns true if one was promoted. */
async function autoBackfill(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  clubSessionId: string,
  sessionName: string,
  hostProfileId: string,
): Promise<boolean> {
  const oldest = await tx.clubSessionBooking.findFirst({
    where: { clubSessionId, status: "waiting_list" },
    orderBy: { requestedAt: "asc" },
    select: { id: true, playerProfileId: true },
  });
  if (!oldest) return false;

  await tx.clubSessionBooking.update({
    where: { id: oldest.id },
    data: { status: "confirmed", decidedAt: new Date() },
  });

  // Notify asynchronously after transaction (can't await inside tx since it
  // sends a network request, but we schedule it to run after commit)
  void notifyAutoBackfill({
    playerProfileId: oldest.playerProfileId,
    hostProfileId,
    sessionName,
    sessionId: clubSessionId,
  });

  return true;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch booking with session + club context in one query
  const booking = await prisma.clubSessionBooking.findUnique({
    where: { id },
    include: {
      clubSession: {
        select: {
          id: true,
          name: true,
          appClubId: true,
          hostId: true,
          lifecycleState: true,
        },
      },
      player: { select: { id: true, displayName: true, squadNickname: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { clubSession } = booking;
  const isManager = await isClubManager(clubSession.appClubId, user.profileId);
  const isOwnBooking = booking.playerProfileId === user.profileId;

  // Must be either a manager or the player who made the booking
  if (!isManager && !isOwnBooking) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status, paidStatus, attendanceStatus } = body as Record<string, unknown>;

  // ── Player self-cancel ────────────────────────────────────────────────────
  // A manager who also booked a spot in their own session must cancel via
  // the self-cancel path (triggers auto-backfill + notifies host), not the
  // host path (which would fire a wrong notification direction).
  if (isOwnBooking && status !== undefined) {
    if (status !== "declined") {
      return NextResponse.json(
        { error: "Players can only cancel (set status to declined) their own booking" },
        { status: 403 },
      );
    }
    if (booking.status === "declined") {
      return NextResponse.json({ error: "Booking is already cancelled" }, { status: 409 });
    }

    const wasConfirmed = booking.status === "confirmed";
    const sessionName = clubSession.name;
    const hostProfileId = clubSession.hostId;
    const playerName =
      booking.player.displayName ?? booking.player.squadNickname ?? "A player";

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.clubSessionBooking.update({
        where: { id },
        data: { status: "declined", decidedAt: new Date() },
      });
      // Auto-backfill only when a confirmed spot is freed
      if (wasConfirmed) {
        await autoBackfill(tx, clubSession.id, sessionName, hostProfileId);
      }
      return b;
    });

    // Notify host (row 7) — player cancelled their confirmed spot
    if (wasConfirmed) {
      void notifyPlayerCancelledToHost({
        playerProfileId: booking.playerProfileId,
        hostProfileId,
        playerDisplayName: playerName,
        sessionName,
        sessionId: clubSession.id,
      });
    }

    return NextResponse.json({ ok: true, booking: updated });
  }

  // ── Host actions ──────────────────────────────────────────────────────────
  if (!isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Status transition (host-reversible, any direction)
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status as BookingStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const newStatus = status as BookingStatus;
    const prevStatus = booking.status as BookingStatus;
    if (newStatus === prevStatus) {
      return NextResponse.json({ ok: true, booking }, { status: 200 });
    }

    const wasConfirmed = prevStatus === "confirmed";
    const sessionName = clubSession.name;
    const hostProfileId = clubSession.hostId;

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.clubSessionBooking.update({
        where: { id },
        data: { status: newStatus, decidedAt: new Date() },
      });
      // Auto-backfill when a confirmed booking is moved off confirmed by the host
      if (wasConfirmed && newStatus !== "confirmed") {
        await autoBackfill(tx, clubSession.id, sessionName, hostProfileId);
      }
      return b;
    });

    // Fire the appropriate notification (spec §4)
    const notifOpts = {
      playerProfileId: booking.playerProfileId,
      hostProfileId,
      sessionName,
      sessionId: clubSession.id,
    };

    if (newStatus === "confirmed") {
      void notifyBookingConfirmed(notifOpts); // rows 1 & 4
    } else if (newStatus === "waiting_list") {
      void notifyBookingWaitingList(notifOpts); // row 2
    } else if (newStatus === "declined") {
      void notifyBookingDeclined(notifOpts); // row 3
    }

    return NextResponse.json({ ok: true, booking: updated });
  }

  // paidStatus toggle (host-only, confirmed bookings only)
  if (paidStatus !== undefined) {
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "paidStatus can only be toggled on confirmed bookings" },
        { status: 409 },
      );
    }
    const updated = await prisma.clubSessionBooking.update({
      where: { id },
      data: { paidStatus: paidStatus === true },
    });
    return NextResponse.json({ ok: true, booking: updated });
  }

  // attendanceStatus toggle (host-only, confirmed bookings only)
  if (attendanceStatus !== undefined) {
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "attendanceStatus can only be set on confirmed bookings" },
        { status: 409 },
      );
    }
    if (!VALID_ATTENDANCE.includes(attendanceStatus as typeof VALID_ATTENDANCE[number])) {
      return NextResponse.json(
        { error: `attendanceStatus must be one of: ${VALID_ATTENDANCE.join(", ")}` },
        { status: 400 },
      );
    }
    const updated = await prisma.clubSessionBooking.update({
      where: { id },
      data: { attendanceStatus: attendanceStatus as string },
    });
    return NextResponse.json({ ok: true, booking: updated });
  }

  return NextResponse.json({ error: "No valid field to update" }, { status: 400 });
}

// GET /api/bookings/[id] — fetch a single booking
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const booking = await prisma.clubSessionBooking.findUnique({
    where: { id },
    include: {
      player: { select: { id: true, displayName: true, squadNickname: true } },
      clubSession: {
        select: {
          id: true, name: true, startTime: true, appClubId: true, hostId: true,
        },
      },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // Only the booking's player or a club manager can view it
  const isOwnBooking = booking.playerProfileId === user.profileId;
  const manager = isOwnBooking
    ? true
    : await isClubManager(booking.clubSession.appClubId, user.profileId);

  if (!isOwnBooking && !manager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ booking });
}
