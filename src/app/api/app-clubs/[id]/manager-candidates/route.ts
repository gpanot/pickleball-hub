import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isOwnerOrAdmin } from "@/lib/club-permissions";
import { prisma } from "@/lib/db";

/**
 * GET /api/app-clubs/[id]/manager-candidates
 *
 * Returns PlayerProfile records that can be added as managers.
 * Excludes players already in the managers list and the caller.
 *
 * ?q=<query>  Search mode: matches squadNickname or displayName (min 2 chars).
 * No ?q       Default mode: returns club members with a CS identity (up to 50).
 *
 * CS identity = has squadNickname OR displayName (non-null, non-empty).
 * No Reclub dependency — works entirely off PlayerProfile.
 *
 * Response: { candidates: [{ profileId, displayName, squadNickname }] }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only Owner or Admin can view candidates (they are the only ones who can add)
  const authorized = await isOwnerOrAdmin(user.profileId, id);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // Collect profileIds already in the managers list (exclude from candidates)
  const existingManagers = await prisma.appClubManager.findMany({
    where: { appClubId: id },
    select: { playerProfileId: true },
  });
  const excludedIds = existingManagers.map((m) => m.playerProfileId);
  // Also exclude the caller (already a manager, but just in case)
  if (!excludedIds.includes(user.profileId)) excludedIds.push(user.profileId);

  const hasIdentityFilter = {
    OR: [
      { squadNickname: { not: null } },
      { displayName: { not: null } },
    ],
  };

  let candidates;

  if (q.length >= 2) {
    // Search mode
    candidates = await prisma.playerProfile.findMany({
      where: {
        id: { notIn: excludedIds },
        ...hasIdentityFilter,
        OR: [
          { squadNickname: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, displayName: true, squadNickname: true },
      take: 20,
      orderBy: { lastSeen: "desc" },
    });
  } else {
    // Default: club members with CS identity
    const members = await prisma.appClubMember.findMany({
      where: { appClubId: id, playerProfileId: { notIn: excludedIds } },
      select: {
        profile: {
          select: { id: true, displayName: true, squadNickname: true },
        },
      },
      take: 50,
      orderBy: { joinedAt: "desc" },
    });

    candidates = members
      .map((m) => m.profile)
      .filter(
        (p) => !!(p.squadNickname ?? p.displayName),
      );
  }

  return NextResponse.json({
    candidates: candidates.map((p) => ({
      profileId: p.id,
      displayName: p.displayName,
      squadNickname: p.squadNickname,
    })),
  });
}
