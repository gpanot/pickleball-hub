import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { can, getClubRole } from "@/lib/club-permissions";
import { prisma } from "@/lib/db";
import { ClubRole } from "@prisma/client";
import {
  notifyManagerRemoved,
  notifySessionsReassigned,
} from "@/lib/club-session-notifications";

// DELETE /api/app-clubs/[id]/managers/[playerProfileId]
// Removing OWNER → 403 CANNOT_REMOVE_OWNER
// Removing ADMIN → requires MANAGE_ADMINS (Owner only)
// Removing HOST_MANAGER → requires MANAGE_HOST_MANAGERS (Owner or Admin)
//
// On remove: upcoming published sessions hosted by the removed manager are
// reassigned to the club Owner in the same transaction.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerProfileId: string }> },
) {
  const { id, playerProfileId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch target manager row
  const targetRow = await prisma.appClubManager.findFirst({
    where: { appClubId: id, playerProfileId },
    select: { id: true, role: true, profile: { select: { displayName: true, squadNickname: true } } },
  });
  if (!targetRow) {
    return NextResponse.json({ error: "Manager not found" }, { status: 404 });
  }

  // Cannot remove the Owner
  if (targetRow.role === ClubRole.OWNER) {
    return NextResponse.json(
      { error: "CANNOT_REMOVE_OWNER", message: "The club Owner cannot be removed" },
      { status: 403 },
    );
  }

  // Permission check based on target role
  const requiredPermission =
    targetRow.role === ClubRole.ADMIN ? "MANAGE_ADMINS" : "MANAGE_HOST_MANAGERS";
  const authorized = await can(user.profileId, id, requiredPermission);
  if (!authorized) {
    return NextResponse.json(
      {
        error:
          targetRow.role === ClubRole.ADMIN
            ? "Only the Owner can remove Admins"
            : "Only Owners and Admins can remove Host Managers",
      },
      { status: 403 },
    );
  }

  // Fetch club name + Owner profileId
  const club = await prisma.appClub.findUnique({
    where: { id },
    select: { name: true, creatorId: true },
  });
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  // Find the current Owner's profileId
  const ownerRow = await prisma.appClubManager.findFirst({
    where: { appClubId: id, role: ClubRole.OWNER },
    select: { playerProfileId: true },
  });
  const ownerProfileId = ownerRow?.playerProfileId ?? club.creatorId;

  // Count upcoming published sessions to reassign
  const now = new Date();
  const upcomingSessions = await prisma.clubSession.findMany({
    where: {
      appClubId: id,
      hostId: playerProfileId,
      lifecycleState: "published",
      startTime: { gt: now },
    },
    select: { id: true },
  });
  const sessionCount = upcomingSessions.length;

  try {
    await prisma.$transaction(async (tx) => {
      // Reassign upcoming sessions to Owner
      if (sessionCount > 0) {
        await tx.clubSession.updateMany({
          where: {
            appClubId: id,
            hostId: playerProfileId,
            lifecycleState: "published",
            startTime: { gt: now },
          },
          data: { hostId: ownerProfileId },
        });
      }
      // Remove manager
      await tx.appClubManager.delete({ where: { id: targetRow.id } });
    });
  } catch (err) {
    console.error("[DELETE /api/app-clubs/[id]/managers/[playerProfileId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const removedNickname =
    targetRow.profile.squadNickname ?? targetRow.profile.displayName ?? "Manager";

  // Fire notifications (fire-and-forget)
  void notifyManagerRemoved({
    removedProfileId: playerProfileId,
    removedByProfileId: user.profileId,
    clubId: id,
    clubName: club.name,
  });

  if (sessionCount > 0 && ownerProfileId !== playerProfileId) {
    void notifySessionsReassigned({
      ownerProfileId,
      removedByProfileId: user.profileId,
      removedNickname,
      clubId: id,
      sessionCount,
    });
  }

  return NextResponse.json({ ok: true, reassignedSessions: sessionCount });
}

// GET /api/app-clubs/[id]/managers/[playerProfileId]
// Returns the count of upcoming published sessions for this manager (used by the removal UI).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerProfileId: string }> },
) {
  const { id, playerProfileId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = await getClubRole(user.profileId, id);
  if (!callerRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const count = await prisma.clubSession.count({
    where: {
      appClubId: id,
      hostId: playerProfileId,
      lifecycleState: "published",
      startTime: { gt: new Date() },
    },
  });

  return NextResponse.json({ upcomingSessionCount: count });
}
