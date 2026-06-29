import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

// GET /api/memberships — check membership or list clubs the caller belongs to
// Auth: required
// Query params: appClubId (check specific membership) | mine=true (list all clubs)
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const appClubId = searchParams.get("appClubId") ?? undefined;

  if (appClubId) {
    const membership = await prisma.appClubMember.findUnique({
      where: {
        appClubId_playerProfileId: {
          appClubId,
          playerProfileId: user.profileId,
        },
      },
      select: { id: true, joinedAt: true },
    });
    return NextResponse.json({ isMember: membership !== null, membership });
  }

  // List all clubs the caller is a member of
  const memberships = await prisma.appClubMember.findMany({
    where: { playerProfileId: user.profileId },
    select: {
      id: true,
      joinedAt: true,
      appClub: {
        select: {
          id: true,
          name: true,
          icon: true,
          privacy: true,
          _count: { select: { members: true, sessions: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });
  return NextResponse.json({ memberships });
}

// POST /api/memberships — join a club (one-tap, no approval state machine in v1)
// Auth: any authenticated player
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { appClubId } = body as { appClubId?: unknown };
  if (!appClubId || typeof appClubId !== "string") {
    return NextResponse.json({ error: "appClubId required" }, { status: 400 });
  }

  const club = await prisma.appClub.findUnique({
    where: { id: appClubId },
    select: { id: true, privacy: true },
  });
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  try {
    const membership = await prisma.appClubMember.create({
      data: { appClubId, playerProfileId: user.profileId },
      select: { id: true, joinedAt: true, appClubId: true },
    });
    return NextResponse.json({ ok: true, membership }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "You are already a member of this club" }, { status: 409 });
    }
    console.error("[POST /api/memberships]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/memberships — leave a club
// Auth: own membership only
export async function DELETE(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const appClubId = searchParams.get("appClubId");
  if (!appClubId) return NextResponse.json({ error: "appClubId required" }, { status: 400 });

  try {
    await prisma.appClubMember.delete({
      where: {
        appClubId_playerProfileId: {
          appClubId,
          playerProfileId: user.profileId,
        },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }
    console.error("[DELETE /api/memberships]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
