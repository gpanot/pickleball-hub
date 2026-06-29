import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";

// GET /api/app-clubs/[id]/managers — list all managers for a club (public)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const managers = await prisma.appClubManager.findMany({
    where: { appClubId: id },
    select: {
      id: true,
      role: true,
      addedAt: true,
      profile: { select: { id: true, displayName: true, squadNickname: true } },
      addedBy: { select: { id: true, displayName: true } },
    },
    orderBy: { addedAt: "asc" },
  });
  return NextResponse.json({ managers });
}

// POST /api/app-clubs/[id]/managers — add a new manager to the club
// Auth: AppClubManager check (any existing manager can add another)
// Note: manager removal is deferred to a future spec revision (no hierarchy in v1).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authorized = await isClubManager(id, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { playerProfileId } = body as { playerProfileId?: unknown };
  if (!playerProfileId || typeof playerProfileId !== "string") {
    return NextResponse.json({ error: "playerProfileId required" }, { status: 400 });
  }

  // Confirm the target player exists
  const targetProfile = await prisma.playerProfile.findUnique({
    where: { id: playerProfileId },
    select: { id: true },
  });
  if (!targetProfile) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  try {
    const manager = await prisma.appClubManager.create({
      data: {
        appClubId: id,
        playerProfileId,
        role: "manager",
        addedById: user.profileId,
      },
      select: {
        id: true,
        role: true,
        addedAt: true,
        profile: { select: { id: true, displayName: true, squadNickname: true } },
      },
    });
    return NextResponse.json({ ok: true, manager }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "This player is already a manager of this club" }, { status: 409 });
    }
    console.error("[POST /api/app-clubs/[id]/managers]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
