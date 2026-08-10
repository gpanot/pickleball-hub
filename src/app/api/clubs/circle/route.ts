/**
 * GET /api/clubs/circle
 * Returns AppClubs where players the viewer follows are ranked members (rank <= 3).
 * Using player_club_ranks as the source of truth rather than joining through raw
 * session history on every request.
 *
 * Shape returned: ClubCardData[]
 * Auth: required (JWT).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { reclubAvatarUrl } from "@/lib/utils";
import type { ClubCardData } from "@/lib/club-card-data";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.reclubUserId) return NextResponse.json({ clubs: [] });

  // Players the viewer follows
  const follows = await prisma.follow.findMany({
    where: { follower: { reclubUserId: user.reclubUserId } },
    select: { followeeId: true },
  });
  const followeeIds = follows.map((f) => f.followeeId);
  if (followeeIds.length === 0) return NextResponse.json({ clubs: [] });

  // Use player_club_ranks (rank <= 3) as the source of truth — much cheaper
  // than re-joining through session history on every request.
  const rankRows = await prisma.playerClubRank.findMany({
    where: {
      userId: { in: followeeIds },
      rank: { lte: 3 },
    },
    select: { userId: true, appClubId: true },
  });

  if (rankRows.length === 0) return NextResponse.json({ clubs: [] });

  // Build map: appClubId → set of follower userIds
  const clubToFollowers = new Map<string, Set<bigint>>();
  for (const r of rankRows) {
    if (!clubToFollowers.has(r.appClubId)) clubToFollowers.set(r.appClubId, new Set());
    clubToFollowers.get(r.appClubId)!.add(r.userId);
  }

  const clubIds = Array.from(clubToFollowers.keys());

  const clubs = await prisma.appClub.findMany({
    where: { id: { in: clubIds } },
    select: {
      id: true,
      name: true,
      icon: true,
      tagline: true,
      coverImageUrl: true,
      vibeTag: true,
      _count: { select: { members: true, sessions: true } },
    },
    take: 20,
  });

  const result: ClubCardData[] = [];
  for (const club of clubs) {
    const circleUserIds = Array.from(clubToFollowers.get(club.id) ?? new Set<bigint>());

    let circlePlayers: { userId: string; displayName: string | null; imageUrl: string | null }[] = [];
    if (circleUserIds.length > 0) {
      const players = await prisma.player.findMany({
        where: { userId: { in: circleUserIds } },
        select: { userId: true, displayName: true, imageUrl: true },
        take: 5,
      });
      circlePlayers = players.map((p) => ({
        userId: p.userId.toString(),
        displayName: p.displayName,
        imageUrl: p.imageUrl ?? reclubAvatarUrl(p.userId),
      }));
    }

    result.push({
      id: club.id,
      name: club.name,
      icon: club.icon,
      tagline: club.tagline,
      coverImageUrl: club.coverImageUrl,
      vibeTag: club.vibeTag,
      memberCount: club._count.members,
      sessionCount: club._count.sessions,
      circlePlayers,
    });
  }

  return NextResponse.json({ clubs: result });
}
