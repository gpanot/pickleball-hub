import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";

const VALID_FORMATS = ["social", "round_robin", "singles"] as const;
const VALID_HOST_ROLES = ["host_and_play", "host_only"] as const;

// POST /api/club-sessions — create a session under an AppClub
// Auth: AppClubManager check on the target appClubId
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    appClubId, name, format, startTime, endTime, durationMin,
    venueId, venuePending, maxPlayers, requiresApproval, privacy,
    feeAmount, feeCurrency, skillLevelMin, skillLevelMax,
    hostRole, notes, sportId,
  } = body as Record<string, unknown>;

  if (!appClubId || typeof appClubId !== "string") {
    return NextResponse.json({ error: "appClubId required" }, { status: 400 });
  }

  // Auth: caller must be a manager of the target club
  const authorized = await isClubManager(appClubId, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!name || typeof name !== "string" || name.trim().length < 1) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!format || !VALID_FORMATS.includes(format as typeof VALID_FORMATS[number])) {
    return NextResponse.json({ error: `format must be one of: ${VALID_FORMATS.join(", ")}` }, { status: 400 });
  }
  if (!startTime || !endTime) {
    return NextResponse.json({ error: "startTime and endTime required" }, { status: 400 });
  }
  const start = new Date(startTime as string);
  const end = new Date(endTime as string);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "startTime and endTime must be valid ISO dates" }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
  }
  const dur = typeof durationMin === "number" ? durationMin : Math.round((end.getTime() - start.getTime()) / 60000);
  if (!maxPlayers || typeof maxPlayers !== "number" || maxPlayers < 1) {
    return NextResponse.json({ error: "maxPlayers must be a positive integer" }, { status: 400 });
  }

  try {
    const session = await prisma.clubSession.create({
      data: {
        appClubId,
        hostId: user.profileId,
        sportId: typeof sportId === "number" ? sportId : null,
        format: format as string,
        name: (name as string).trim(),
        startTime: start,
        endTime: end,
        durationMin: dur,
        venueId: typeof venueId === "number" ? venueId : null,
        venuePending: venuePending === true,
        maxPlayers: maxPlayers as number,
        requiresApproval: requiresApproval === true,
        privacy: privacy === "private" ? "private" : "public",
        feeAmount: typeof feeAmount === "number" ? feeAmount : null,
        feeCurrency: typeof feeCurrency === "string" ? feeCurrency : null,
        skillLevelMin: typeof skillLevelMin === "number" ? skillLevelMin : null,
        skillLevelMax: typeof skillLevelMax === "number" ? skillLevelMax : null,
        hostRole: VALID_HOST_ROLES.includes(hostRole as typeof VALID_HOST_ROLES[number])
          ? (hostRole as string)
          : "host_and_play",
        notes: typeof notes === "string" ? notes : null,
        lifecycleState: "draft",
      },
      include: {
        host: { select: { id: true, displayName: true, squadNickname: true } },
        venue: { select: { id: true, name: true, address: true } },
        _count: { select: { bookings: true } },
      },
    });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/club-sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/club-sessions — list sessions with filters
// Auth: none required for public sessions; draft sessions only visible to managers
// Query params: appClubId, timeframe (upcoming|past|all), lifecycleState, take, cursor
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  const { searchParams } = req.nextUrl;
  const appClubId = searchParams.get("appClubId") ?? undefined;
  const timeframe = searchParams.get("timeframe") ?? "upcoming"; // upcoming | past | all
  const take = Math.min(Number(searchParams.get("take") ?? "20"), 50);
  const cursor = searchParams.get("cursor") ?? undefined;

  const now = new Date();

  // Draft sessions are only visible to the session's club managers
  const canSeeDrafts = user
    ? (appClubId ? await isClubManager(appClubId, user.profileId) : false)
    : false;

  // "deleted" sessions are always excluded from all listing queries.
  // Public browse: published only. Club managers also see draft + cancelled.
  const lifecycleFilter = canSeeDrafts
    ? { lifecycleState: { in: ["published", "draft", "cancelled"] } }
    : { lifecycleState: "published" };

  const timeFilter =
    timeframe === "upcoming"
      ? { startTime: { gte: now } }
      : timeframe === "past"
      ? { startTime: { lt: now } }
      : {};

  const sessions = await prisma.clubSession.findMany({
    where: {
      ...(appClubId ? { appClubId } : { privacy: "public" }),
      ...lifecycleFilter,
      ...timeFilter,
    },
    select: {
      id: true,
      appClubId: true,
      name: true,
      format: true,
      startTime: true,
      endTime: true,
      durationMin: true,
      maxPlayers: true,
      requiresApproval: true,
      privacy: true,
      feeAmount: true,
      feeCurrency: true,
      skillLevelMin: true,
      skillLevelMax: true,
      lifecycleState: true,
      venuePending: true,
      notes: true,
      createdAt: true,
      host: { select: { id: true, displayName: true, squadNickname: true } },
      venue: { select: { id: true, name: true, address: true } },
      appClub: { select: { id: true, name: true, icon: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: timeframe === "past" ? { startTime: "desc" } : { startTime: "asc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const nextCursor = sessions.length === take ? sessions[sessions.length - 1].id : null;
  return NextResponse.json({ sessions, nextCursor });
}
