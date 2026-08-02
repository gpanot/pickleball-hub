import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { can } from "@/lib/club-permissions";
import { prisma } from "@/lib/db";
import { ClubRole } from "@prisma/client";
import {
  notifyManagerAdded,
} from "@/lib/club-session-notifications";

const MANAGER_PROFILE_SELECT = {
  id: true,
  displayName: true,
  squadNickname: true,
  userId: true,
  user: { select: { image: true } },
} as const;

const MANAGER_ROW_SELECT = {
  id: true,
  playerProfileId: true,
  role: true,
  addedAt: true,
  profile: { select: MANAGER_PROFILE_SELECT },
} as const;

const ROLE_ORDER: Record<ClubRole, number> = {
  [ClubRole.OWNER]: 0,
  [ClubRole.ADMIN]: 1,
  [ClubRole.HOST_MANAGER]: 2,
};

const ROLE_LABEL: Record<ClubRole, string> = {
  [ClubRole.OWNER]: "Owner",
  [ClubRole.ADMIN]: "Admin",
  [ClubRole.HOST_MANAGER]: "Host Manager",
};

// GET /api/app-clubs/[id]/managers
// Auth: any authenticated user can view the manager list
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const managers = await prisma.appClubManager.findMany({
    where: { appClubId: id },
    select: MANAGER_ROW_SELECT,
    orderBy: { addedAt: "asc" },
  });

  const sorted = [...managers].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
  );

  return NextResponse.json({ managers: sorted });
}

// POST /api/app-clubs/[id]/managers
// Body: { playerProfileId, role: "ADMIN" | "HOST_MANAGER" }
// Adding ADMIN requires MANAGE_ADMINS (Owner only).
// Adding HOST_MANAGER requires MANAGE_HOST_MANAGERS (Owner or Admin).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { playerProfileId, role } = body as { playerProfileId?: unknown; role?: unknown };

  if (!playerProfileId || typeof playerProfileId !== "string") {
    return NextResponse.json({ error: "playerProfileId required" }, { status: 400 });
  }

  const targetRole: ClubRole =
    role === "ADMIN" ? ClubRole.ADMIN : ClubRole.HOST_MANAGER;

  // Permission check
  const requiredPermission =
    targetRole === ClubRole.ADMIN ? "MANAGE_ADMINS" : "MANAGE_HOST_MANAGERS";
  const authorized = await can(user.profileId, id, requiredPermission);
  if (!authorized) {
    return NextResponse.json(
      {
        error:
          targetRole === ClubRole.ADMIN
            ? "Only the Owner can add Admins"
            : "Only Owners and Admins can add Host Managers",
      },
      { status: 403 },
    );
  }

  // Validate target profile has CS identity
  const targetProfile = await prisma.playerProfile.findUnique({
    where: { id: playerProfileId },
    select: { id: true, displayName: true, squadNickname: true },
  });
  if (!targetProfile) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  const hasIdentity = !!(targetProfile.squadNickname ?? targetProfile.displayName);
  if (!hasIdentity) {
    return NextResponse.json(
      { error: "Player must have a CS identity (display name) before being added as a manager" },
      { status: 422 },
    );
  }

  // Fetch club name for notification
  const club = await prisma.appClub.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  try {
    const manager = await prisma.appClubManager.create({
      data: {
        appClubId: id,
        playerProfileId,
        role: targetRole,
        addedById: user.profileId,
      },
      select: MANAGER_ROW_SELECT,
    });

    void notifyManagerAdded({
      addedProfileId: playerProfileId,
      addedByProfileId: user.profileId,
      clubId: id,
      clubName: club.name,
      roleLabel: ROLE_LABEL[targetRole],
    });

    return NextResponse.json({ ok: true, manager }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "This player is already a manager of this club" },
        { status: 409 },
      );
    }
    console.error("[POST /api/app-clubs/[id]/managers]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
