import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

const VALID_PRIVACY = ["public", "private"] as const;

// POST /api/app-clubs — create a new AppClub
// Auth: any authenticated player who has not yet founded a club.
// Seeds a "creator" row into AppClubManager atomically.
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, icon, sportId, privacy, level, autoApproveNewMembers } = body as {
    name?: unknown;
    icon?: unknown;
    sportId?: unknown;
    privacy?: unknown;
    level?: unknown;
    autoApproveNewMembers?: unknown;
  };

  if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
    return NextResponse.json({ error: "Club name must be 1–80 characters" }, { status: 400 });
  }

  const privacyValue = typeof privacy === "string" && VALID_PRIVACY.includes(privacy as typeof VALID_PRIVACY[number])
    ? (privacy as string)
    : "public";

  try {
    const club = await prisma.$transaction(async (tx) => {
      const created = await tx.appClub.create({
        data: {
          name: name.trim(),
          icon: typeof icon === "string" ? icon : null,
          sportId: typeof sportId === "number" ? sportId : null,
          privacy: privacyValue,
          level: typeof level === "string" ? level : null,
          autoApproveNewMembers: autoApproveNewMembers !== false,
          creatorId: user.profileId,
          managers: {
            create: {
              playerProfileId: user.profileId,
              role: "creator",
              addedById: user.profileId,
            },
          },
        },
        include: { managers: true },
      });
      return created;
    });

    return NextResponse.json({ ok: true, club }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "You have already founded a club. Each player can only found one club." },
        { status: 409 }
      );
    }
    console.error("[POST /api/app-clubs]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CLUB_SELECT = {
  id: true,
  name: true,
  icon: true,
  sportId: true,
  privacy: true,
  level: true,
  autoApproveNewMembers: true,
  createdAt: true,
  creator: { select: { id: true, displayName: true, squadNickname: true } },
  _count: { select: { members: true, sessions: true } },
} as const;

// GET /api/app-clubs — list public clubs, with optional search and pagination
// ?mine=true — list clubs where the authenticated caller is a manager (any privacy)
// Auth: none required for public listing; required for ?mine=true
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  const { searchParams } = req.nextUrl;

  // ?mine=true — return clubs the caller manages (requires auth)
  if (searchParams.get("mine") === "true") {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const managed = await prisma.appClubManager.findMany({
      where: { playerProfileId: user.profileId },
      select: { appClub: { select: CLUB_SELECT } },
      orderBy: { addedAt: "desc" },
    });
    return NextResponse.json({ clubs: managed.map((m) => m.appClub) });
  }

  const search = searchParams.get("search") ?? "";
  const cursor = searchParams.get("cursor") ?? undefined;
  const take = Math.min(Number(searchParams.get("take") ?? "20"), 50);

  const clubs = await prisma.appClub.findMany({
    where: {
      privacy: "public",
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    select: CLUB_SELECT,
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const nextCursor = clubs.length === take ? clubs[clubs.length - 1].id : null;
  return NextResponse.json({ clubs, nextCursor });
}
