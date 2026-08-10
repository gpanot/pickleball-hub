/**
 * GET /api/clubs/circle
 * Returns AppClubs where players the viewer follows have played sessions (via ClubSession.venueId
 * matched to scrape Session.venueId in session_rosters).
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

  // Find venues where followed players have recent sessions (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const ninetyAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

  const venueRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      isConfirmed: true,
      session: {
        venueId: { not: null },
        scrapedDate: { gte: ninetyAgoStr },
      },
    },
    select: {
      userId: true,
      session: { select: { venueId: true } },
    },
  });

  // Build map: venueId → set of follower player userIds
  const venueToFollowers = new Map<number, Set<bigint>>();
  for (const r of venueRosters) {
    const vid = r.session.venueId!;
    if (!venueToFollowers.has(vid)) venueToFollowers.set(vid, new Set());
    venueToFollowers.get(vid)!.add(r.userId);
  }
  if (venueToFollowers.size === 0) return NextResponse.json({ clubs: [] });

  // Find AppClubs that have sessions at those venues
  const venueIds = Array.from(venueToFollowers.keys());
  const clubSessionRows = await prisma.clubSession.findMany({
    where: { venueId: { in: venueIds } },
    select: { appClubId: true, venueId: true },
    distinct: ["appClubId"],
  });

  if (clubSessionRows.length === 0) return NextResponse.json({ clubs: [] });

  const clubIds = [...new Set(clubSessionRows.map((r) => r.appClubId))];

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

  // Build circle follower player objects
  const result: ClubCardData[] = [];
  for (const club of clubs) {
    const clubVenueIds = clubSessionRows
      .filter((r) => r.appClubId === club.id)
      .map((r) => r.venueId)
      .filter((v): v is number => v !== null);

    const circleUserIds: bigint[] = [];
    for (const vid of clubVenueIds) {
      const s = venueToFollowers.get(vid);
      if (s) s.forEach((uid) => circleUserIds.push(uid));
    }
    const uniqueCircleIds = [...new Set(circleUserIds)];

    let circlePlayers: { userId: string; displayName: string | null; imageUrl: string | null }[] = [];
    if (uniqueCircleIds.length > 0) {
      const players = await prisma.player.findMany({
        where: { userId: { in: uniqueCircleIds } },
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
