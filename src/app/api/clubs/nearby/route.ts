/**
 * GET /api/clubs/nearby
 * Returns AppClubs the viewer hasn't played at yet, ordered by recent activity (last 30 days).
 * Cap: 10 results.
 * Auth: required (JWT).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import type { ClubCardData } from "@/lib/club-card-data";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Clubs the viewer has already visited (via session_rosters at those venues)
  let myVenueIds: number[] = [];
  if (user.reclubUserId) {
    const myRosters = await prisma.sessionRoster.findMany({
      where: {
        userId: user.reclubUserId,
        isConfirmed: true,
        session: { venueId: { not: null } },
      },
      select: { session: { select: { venueId: true } } },
      distinct: ["sessionId"],
    });
    myVenueIds = [
      ...new Set(
        myRosters.map((r) => r.session.venueId).filter((v): v is number => v !== null)
      ),
    ];
  }

  // Club IDs at venues I've already played at
  let myClubIds: string[] = [];
  if (myVenueIds.length > 0) {
    const myClubSessions = await prisma.clubSession.findMany({
      where: { venueId: { in: myVenueIds } },
      select: { appClubId: true },
      distinct: ["appClubId"],
    });
    myClubIds = myClubSessions.map((cs) => cs.appClubId);
  }

  // Recent activity: clubs with most sessions in last 30 days, excluding my clubs
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activityRows = await prisma.clubSession.groupBy({
    by: ["appClubId"],
    where: {
      startTime: { gte: thirtyDaysAgo },
      ...(myClubIds.length > 0 ? { appClubId: { notIn: myClubIds } } : {}),
    },
    _count: { appClubId: true },
    orderBy: { _count: { appClubId: "desc" } },
    take: 10,
  });

  if (activityRows.length === 0) return NextResponse.json({ clubs: [] });

  const activityClubIds = activityRows.map((r) => r.appClubId);
  const clubs = await prisma.appClub.findMany({
    where: { id: { in: activityClubIds }, privacy: "public" },
    select: {
      id: true,
      name: true,
      icon: true,
      tagline: true,
      coverImageUrl: true,
      vibeTag: true,
      _count: { select: { members: true, sessions: true } },
    },
  });

  const activityMap = new Map(activityRows.map((r) => [r.appClubId, r._count.appClubId]));

  const result: ClubCardData[] = clubs
    .sort((a, b) => (activityMap.get(b.id) ?? 0) - (activityMap.get(a.id) ?? 0))
    .map((club) => ({
      id: club.id,
      name: club.name,
      icon: club.icon,
      tagline: club.tagline,
      coverImageUrl: club.coverImageUrl,
      vibeTag: club.vibeTag,
      memberCount: club._count.members,
      sessionCount: club._count.sessions,
      recentActivity: activityMap.get(club.id) ?? 0,
    }));

  return NextResponse.json({ clubs: result });
}
