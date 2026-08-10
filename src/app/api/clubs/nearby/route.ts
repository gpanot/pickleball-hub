/**
 * GET /api/clubs/nearby?lat={lat}&lng={lng}&radiusKm=50
 *
 * Returns public AppClubs with a set location within radiusKm of the player,
 * ordered by distance ASC, then recent activity DESC.
 * Excludes clubs the viewer has already played at (via session_rosters).
 * Cap: 10 results.
 * Auth: required (JWT).
 *
 * When lat/lng are missing returns { clubs: [], locationRequired: true }.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/squad-geo";
import type { ClubCardData } from "@/lib/club-card-data";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ clubs: [], locationRequired: true });
  }

  let radiusKm = parseFloat(searchParams.get("radiusKm") ?? "50");
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = 50;
  if (radiusKm > 100) radiusKm = 100;

  // Clubs the viewer has already visited (via session_rosters at those venues)
  let myClubIds: string[] = [];
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
    const myVenueIds = [
      ...new Set(
        myRosters.map((r) => r.session.venueId).filter((v): v is number => v !== null)
      ),
    ];
    if (myVenueIds.length > 0) {
      const myClubSessions = await prisma.clubSession.findMany({
        where: { venueId: { in: myVenueIds } },
        select: { appClubId: true },
        distinct: ["appClubId"],
      });
      myClubIds = myClubSessions.map((cs) => cs.appClubId);
    }
  }

  // All public clubs with lat/lng set, excluding already-visited
  const candidates = await prisma.appClub.findMany({
    where: {
      privacy: "public",
      latitude: { not: null },
      longitude: { not: null },
      ...(myClubIds.length > 0 ? { id: { notIn: myClubIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      icon: true,
      tagline: true,
      coverImageUrl: true,
      vibeTag: true,
      city: true,
      latitude: true,
      longitude: true,
      _count: { select: { members: true, sessions: true } },
    },
  });

  // Haversine filter
  const withinRadius = candidates
    .map((club) => ({
      club,
      distanceKm: haversineKm(lat, lng, club.latitude!, club.longitude!),
    }))
    .filter(({ distanceKm }) => distanceKm <= radiusKm);

  if (withinRadius.length === 0) return NextResponse.json({ clubs: [] });

  // Recent activity: sessions in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const nearbyIds = withinRadius.map(({ club }) => club.id);
  const activityRows = await prisma.clubSession.groupBy({
    by: ["appClubId"],
    where: {
      appClubId: { in: nearbyIds },
      startTime: { gte: thirtyDaysAgo },
    },
    _count: { appClubId: true },
  });
  const activityMap = new Map(activityRows.map((r) => [r.appClubId, r._count.appClubId]));

  // Sort: distance ASC, then recentActivity DESC
  const sorted = withinRadius
    .sort((a, b) => {
      const distDiff = a.distanceKm - b.distanceKm;
      if (Math.abs(distDiff) > 0.5) return distDiff;
      return (activityMap.get(b.club.id) ?? 0) - (activityMap.get(a.club.id) ?? 0);
    })
    .slice(0, 10);

  const result: ClubCardData[] = sorted.map(({ club, distanceKm }) => ({
    id: club.id,
    name: club.name,
    icon: club.icon,
    tagline: club.tagline,
    coverImageUrl: club.coverImageUrl,
    vibeTag: club.vibeTag,
    city: club.city,
    memberCount: club._count.members,
    sessionCount: club._count.sessions,
    recentActivity: activityMap.get(club.id) ?? 0,
    distanceKm: Math.round(distanceKm * 10) / 10,
  }));

  return NextResponse.json({ clubs: result });
}
