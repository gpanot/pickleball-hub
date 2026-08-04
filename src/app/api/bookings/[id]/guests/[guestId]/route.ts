/**
 * DELETE /api/bookings/[id]/guests/[guestId]
 * Remove a guest companion from a confirmed booking.
 * Auth: booking's own player OR club manager.
 * Frees one capacity slot and runs waitlist auto-backfill.
 *
 * PATCH /api/bookings/[id]/guests/[guestId]
 * Toggle paidStatus / paidAmount / attendanceStatus on a guest.
 * Auth: club manager only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";
import { notifyAutoBackfill } from "@/lib/club-session-notifications";

const VALID_ATTENDANCE = ["unmarked", "checked_in", "no_show"] as const;

type Params = { params: Promise<{ id: string; guestId: string }> };

async function resolveContext(bookingId: string, guestId: string, userId: string) {
  const [guest, booking] = await Promise.all([
    prisma.clubSessionGuest.findUnique({
      where: { id: guestId },
      select: { id: true, bookingId: true, clubSessionId: true },
    }),
    prisma.clubSessionBooking.findUnique({
      where: { id: bookingId },
      include: {
        clubSession: { select: { id: true, appClubId: true, hostId: true, name: true } },
      },
    }),
  ]);
  if (!guest || !booking) return null;
  if (guest.bookingId !== bookingId) return null;
  const isOwn = booking.playerProfileId === userId;
  const isManager = await isClubManager(booking.clubSession.appClubId, userId);
  return { guest, booking, isOwn, isManager };
}

// DELETE — player or host removes a guest
export async function DELETE(
  req: NextRequest,
  { params }: Params,
) {
  const { id: bookingId, guestId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveContext(bookingId, guestId, user.profileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.isOwn && !ctx.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { booking } = ctx;
  const sessionName = booking.clubSession.name;
  const hostProfileId = booking.clubSession.hostId;
  const wasConfirmed = booking.status === "confirmed";

  await prisma.$transaction(async (tx) => {
    await tx.clubSessionGuest.delete({ where: { id: guestId } });

    // Free the slot: auto-backfill one waiting-list player if the parent booking is confirmed
    if (wasConfirmed) {
      const oldest = await tx.clubSessionBooking.findFirst({
        where: { clubSessionId: booking.clubSessionId, status: "waiting_list" },
        orderBy: { requestedAt: "asc" },
        select: { id: true, playerProfileId: true },
      });
      if (oldest) {
        await tx.clubSessionBooking.update({
          where: { id: oldest.id },
          data: { status: "confirmed", decidedAt: new Date() },
        });
        void notifyAutoBackfill({
          playerProfileId: oldest.playerProfileId,
          hostProfileId,
          sessionName,
          sessionId: booking.clubSessionId,
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

// PATCH — host updates paidStatus / paidAmount / attendanceStatus on a guest
export async function PATCH(
  req: NextRequest,
  { params }: Params,
) {
  const { id: bookingId, guestId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveContext(bookingId, guestId, user.profileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.isManager) {
    return NextResponse.json({ error: "Forbidden — host/manager only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { paidStatus, paidAmount, attendanceStatus } = body;

  const data: Record<string, unknown> = {};

  if (paidStatus !== undefined) {
    data.paidStatus = paidStatus === true;
  }
  if (paidAmount !== undefined) {
    data.paidAmount = paidAmount === null ? null : Number(paidAmount);
  }
  if (attendanceStatus !== undefined) {
    if (!VALID_ATTENDANCE.includes(attendanceStatus as typeof VALID_ATTENDANCE[number])) {
      return NextResponse.json(
        { error: `attendanceStatus must be one of: ${VALID_ATTENDANCE.join(", ")}` },
        { status: 400 },
      );
    }
    data.attendanceStatus = attendanceStatus;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid field to update" }, { status: 400 });
  }

  const updated = await prisma.clubSessionGuest.update({ where: { id: guestId }, data });
  return NextResponse.json({ guest: updated });
}
