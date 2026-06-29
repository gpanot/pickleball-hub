import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";

const BOOKING_SELECT = {
  id: true,
  playerProfileId: true,
  clubSessionId: true,
  status: true,
  paidStatus: true,
  attendanceStatus: true,
  requestedAt: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  player: { select: { id: true, displayName: true, squadNickname: true } },
  clubSession: {
    select: {
      id: true,
      name: true,
      startTime: true,
      requiresApproval: true,
      appClub: { select: { id: true, name: true } },
    },
  },
} as const;

// POST /api/bookings — create a booking for a published session
// Auth: any authenticated player
// Initial status: "confirmed" if requiresApproval is false, else "requested"
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clubSessionId } = body as { clubSessionId?: unknown };
  if (!clubSessionId || typeof clubSessionId !== "string") {
    return NextResponse.json({ error: "clubSessionId required" }, { status: 400 });
  }

  const session = await prisma.clubSession.findUnique({
    where: { id: clubSessionId },
    select: {
      id: true,
      lifecycleState: true,
      requiresApproval: true,
      appClub: { select: { id: true, autoApproveNewMembers: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.lifecycleState !== "published") {
    return NextResponse.json({ error: "Session is not open for booking" }, { status: 409 });
  }

  const initialStatus = session.requiresApproval ? "requested" : "confirmed";

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.clubSessionBooking.create({
        data: {
          playerProfileId: user.profileId,
          clubSessionId,
          status: initialStatus,
          ...(initialStatus === "confirmed" ? { decidedAt: new Date() } : {}),
        },
        select: BOOKING_SELECT,
      });

      // If the club has autoApproveNewMembers, ensure the player is a member
      if (session.appClub.autoApproveNewMembers) {
        await tx.appClubMember.upsert({
          where: {
            appClubId_playerProfileId: {
              appClubId: session.appClub.id,
              playerProfileId: user.profileId,
            },
          },
          create: {
            appClubId: session.appClub.id,
            playerProfileId: user.profileId,
          },
          update: {},
        });
      }

      return created;
    });

    return NextResponse.json({ ok: true, booking }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "You already have a booking for this session" }, { status: 409 });
    }
    console.error("[POST /api/bookings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/bookings — list bookings
// Auth: required
// Query params: clubSessionId (list all bookings for a session — managers only)
//              mine=true (list the caller's own bookings)
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const clubSessionId = searchParams.get("clubSessionId") ?? undefined;
  const mine = searchParams.get("mine") === "true";
  const take = Math.min(Number(searchParams.get("take") ?? "50"), 100);

  if (clubSessionId) {
    // Managers can list all bookings for a session; players can only see their own
    const session = await prisma.clubSession.findUnique({
      where: { id: clubSessionId },
      select: { appClubId: true },
    });
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const isManager = await isClubManager(session.appClubId, user.profileId);

    const bookings = await prisma.clubSessionBooking.findMany({
      where: {
        clubSessionId,
        ...(isManager ? {} : { playerProfileId: user.profileId }),
      },
      select: BOOKING_SELECT,
      orderBy: { requestedAt: "asc" },
      take,
    });
    return NextResponse.json({ bookings });
  }

  if (mine) {
    const bookings = await prisma.clubSessionBooking.findMany({
      where: { playerProfileId: user.profileId },
      select: BOOKING_SELECT,
      orderBy: { createdAt: "desc" },
      take,
    });
    return NextResponse.json({ bookings });
  }

  return NextResponse.json({ error: "Provide clubSessionId or mine=true" }, { status: 400 });
}
