/**
 * POST /api/bookings/[id]/guests
 *
 * Add a name-only guest companion to a confirmed booking.
 * Auth: the booking's own player OR a club manager (host adding on behalf).
 *
 * Rules:
 *  - Parent booking must be "confirmed".
 *  - Group size (booker + existing guests) must be < 5 before adding.
 *  - skillLevelLabel must be a valid label for the session's sport.
 *  - Guest counts against session capacity (same soft gate as booking POST).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";
import { maybePromoteCapacity } from "@/lib/club-session-capacity";
import { validLabelsForSportId, levelsForSportId } from "@/lib/sport-levels";

const MAX_GROUP_SIZE = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const booking = await prisma.clubSessionBooking.findUnique({
    where: { id: bookingId },
    include: {
      clubSession: {
        select: {
          id: true,
          appClubId: true,
          sportId: true,
          maxPlayers: true,
          lifecycleState: true,
        },
      },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const isOwnBooking = booking.playerProfileId === user.profileId;
  const managerCheck = isOwnBooking
    ? false
    : await isClubManager(booking.clubSession.appClubId, user.profileId);

  if (!isOwnBooking && !managerCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Guests can only be added to confirmed bookings" },
      { status: 409 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { displayName, skillLevelLabel } = body as {
    displayName?: unknown;
    skillLevelLabel?: unknown;
  };

  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const validLabels = validLabelsForSportId(booking.clubSession.sportId);
  if (typeof skillLevelLabel !== "string" || !validLabels.has(skillLevelLabel)) {
    return NextResponse.json(
      {
        error: `skillLevelLabel must be one of: ${[...validLabels].join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Resolve numeric value from label
  const levelOption = levelsForSportId(booking.clubSession.sportId).find(
    (l) => l.label === skillLevelLabel,
  );
  const skillLevelValue = levelOption?.value ?? null;

  const clubSessionId = booking.clubSessionId;

  // Validate group cap before entering transaction (non-atomic but good enough as soft gate)
  const existingGuests = await prisma.clubSessionGuest.count({ where: { bookingId } });
  if (existingGuests + 1 >= MAX_GROUP_SIZE) {
    return NextResponse.json(
      { error: "Group is full (max 5 including booker)" },
      { status: 409 },
    );
  }

  try {
    const guest = await prisma.$transaction(async (tx) => {
      const created = await tx.clubSessionGuest.create({
        data: {
          clubSessionId,
          bookingId,
          bookedByProfileId: booking.playerProfileId,
          displayName: (displayName as string).trim(),
          skillLevelLabel: skillLevelLabel as string,
          skillLevelValue,
          addedBy: managerCheck ? "host" : "player",
        },
      });
      await maybePromoteCapacity(tx, clubSessionId);
      return created;
    });

    return NextResponse.json({ guest }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/bookings/[id]/guests]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
