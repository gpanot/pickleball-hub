import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import {
  reclubAvatarUrl,
  vnCalendarDateString,
  vnCurrentTimeString,
  haversineKm,
  isFillingFast,
} from "@/lib/utils";
import { CACHE_CONTROL_PRIVATE } from "@/lib/http-cache-headers";
import { calculateMatchScore } from "@/lib/match-score";

const RANGE_KM = 10;

type PlayCard = {
  sessionId: number;
  name: string;
  clubName: string;
  venueName: string;
  startTime: string;
  scrapedDate: string;
  spotsLeft: number;
  totalSpots: number;
  eventUrl: string;
  matchScore: number;
  distanceKm: number | null;
  fillingFast: boolean;
  fillRate: number;
  friendCount: number;
  friends: Array<{
    userId: string;
    displayName: string;
    imageUrl: string | null;
    duprDoubles: number | null;
  }>;
  topDupr: Array<{
    userId: string;
    displayName: string | null;
    imageUrl: string | null;
    duprDoubles: number | null;
    isFollowing: boolean;
  }>;
  hasFriends: boolean;
  totalRoster: number;
  duprCount: number;
};

/**
 * GET /api/play?filter=today|tomorrow&lat=&lng=
 *
 * Returns the top 5 recommended sessions for the Play screen.
 * Explore sessions are loaded separately via /api/sessions/swipe-deck.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const filter = searchParams.get("filter") ?? "today";
  const duprMinParam = parseFloat(searchParams.get("duprMin") ?? "0");
  const duprMin = Number.isFinite(duprMinParam) ? duprMinParam : 0;
  const timeSlotsParam = searchParams.get("timeSlots") ?? "";
  const timeSlots = timeSlotsParam
    ? timeSlotsParam.split(",").filter((s) => ["morning", "afternoon", "evening"].includes(s))
    : ["morning", "afternoon", "evening"];
  const today = vnCalendarDateString(0);
  const tomorrow = vnCalendarDateString(1);
  const dateStr = filter === "tomorrow" ? tomorrow : today;
  const minTime = filter === "today" ? vnCurrentTimeString() : undefined;

  const userLat = Number.isFinite(lat) ? lat : null;
  const userLng = Number.isFinite(lng) ? lng : null;

  // Bounding-box pre-filter: reduces rows Postgres returns before the precise
  // JS haversine check. Uses @@index([latitude, longitude]) on the Venue model.
  // Only applied when we have a real GPS fix (lat and lng are both non-zero).
  // Sessions without a venue relation are NOT excluded — the Prisma nullable-
  // relation filter only matches rows where venue IS set and within bounds, so
  // venueId-null sessions pass through and are handled by the JS distance wall.
  const hasPreciseLocation = lat !== 0 && lng !== 0 && Number.isFinite(lat) && Number.isFinite(lng);
  const GEO_KM = 5;
  const latDelta = GEO_KM / 111;
  const lngDelta = GEO_KM / (111 * Math.cos((lat * Math.PI) / 180));
  const geoFilter = hasPreciseLocation
    ? {
        venue: {
          latitude: { gte: lat - latDelta, lte: lat + latDelta },
          longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
        },
      }
    : {};

  const sessionWhere = {
    scrapedDate: dateStr,
    status: "active" as const,
    ...(minTime ? { startTime: { gte: minTime } } : {}),
    ...geoFilter,
  };

  const sessionInclude = {
    club: { select: { name: true, slug: true } },
    venue: { select: { name: true, latitude: true, longitude: true } },
    duprStat: true,
    snapshots: { orderBy: { scrapedAt: "desc" as const }, take: 2 },
    rosters: {
      where: { isConfirmed: true },
      include: {
        player: {
          select: {
            userId: true,
            displayName: true,
            imageUrl: true,
            duprDoubles: true,
          },
        },
      },
      orderBy: { player: { duprDoubles: "desc" as const } },
      take: 10,
    },
    _count: { select: { rosters: true } },
  } as const;

  const [userProfile, follows, sessions] = await Promise.all([
    user?.reclubUserId
      ? prisma.player.findUnique({
          where: { userId: user.reclubUserId },
          select: { duprDoubles: true },
        })
      : Promise.resolve(null),
    user?.profileId
      ? prisma.follow.findMany({
          where: { followerId: user.profileId },
          select: { followeeId: true },
        })
      : Promise.resolve([]),
    prisma.session.findMany({
      where: sessionWhere,
      include: sessionInclude,
      orderBy: { startTime: "asc" },
    }),
  ]);
  const followeeIds = new Set(follows.map((f) => f.followeeId.toString()));

  type Scored = {
    card: PlayCard;
    sessionId: number;
    duprCoverageCount: number;
  };

  const scored: Scored[] = [];

  for (const session of sessions) {
    const snap0 = session.snapshots[0];
    const snap1 = session.snapshots[1];
    const joined = snap0?.joined ?? 0;
    const joinedPrev = snap1?.joined ?? 0;
    const joinedRecently = Math.max(0, joined - joinedPrev);
    const spotsLeft = Math.max(0, session.maxPlayers - joined);
    if (spotsLeft <= 0) continue;

    // Time-slot filter — only applied when user explicitly excluded some slots
    if (timeSlots.length < 3) {
      const startHour = parseInt(session.startTime.split(":")[0] ?? "12", 10);
      const slot =
        startHour < 12 ? "morning" : startHour < 17 ? "afternoon" : "evening";
      if (!timeSlots.includes(slot)) continue;
    }

    // Min DUPR filter
    if (duprMin > 0 && session.duprStat?.avgDuprDoubles != null) {
      if (Number(session.duprStat.avgDuprDoubles) < duprMin) continue;
    }

    const fillRate =
      session.maxPlayers > 0 ? joined / session.maxPlayers : 0;
    const fillingFast = isFillingFast(fillRate, joinedRecently);

    let distanceKm: number | null = null;
    if (
      userLat !== null &&
      userLng !== null &&
      session.venue?.latitude != null &&
      session.venue?.longitude != null
    ) {
      distanceKm =
        Math.round(
          haversineKm(
            userLat,
            userLng,
            session.venue.latitude,
            session.venue.longitude,
          ) * 10,
        ) / 10;
    }

    if (distanceKm !== null && distanceKm > RANGE_KM) continue;

    const friendRosters = session.rosters.filter((r) =>
      followeeIds.has((r.player?.userId ?? r.userId).toString()),
    );
    const friendCount = friendRosters.length;

    const friends = friendRosters.slice(0, 3).map((r) => {
      const uid = r.player?.userId ?? r.userId;
      return {
        userId: uid.toString(),
        displayName: r.player?.displayName ?? "Player",
        imageUrl: r.player?.imageUrl ?? reclubAvatarUrl(uid),
        duprDoubles:
          r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null,
      };
    });

    const topDupr = [...session.rosters]
      .filter((r) => r.player?.duprDoubles != null && Number(r.player.duprDoubles) > 0)
      .sort(
        (a, b) =>
          Number(b.player!.duprDoubles) - Number(a.player!.duprDoubles),
      )
      .slice(0, 8)
      .map((r) => {
        const uid = (r.player?.userId ?? r.userId).toString();
        return {
          userId: uid,
          displayName: r.player?.displayName ?? null,
          imageUrl:
            r.player?.imageUrl ?? reclubAvatarUrl(r.player?.userId ?? r.userId),
          duprDoubles: Number(r.player!.duprDoubles),
          isFollowing: followeeIds.has(uid),
        };
      });

    const matchScore = calculateMatchScore({
      userDupr: userProfile?.duprDoubles
        ? Number(userProfile.duprDoubles)
        : null,
      sessionAvgDupr: session.duprStat?.avgDuprDoubles
        ? Number(session.duprStat.avgDuprDoubles)
        : null,
      distanceKm,
      fillRate,
      joinedRecently,
      fillingFast,
      returningPlayerPct: session.duprStat?.returningPlayerPct
        ? Number(session.duprStat.returningPlayerPct)
        : null,
      friendCount,
    });

    const venueName = session.venue?.name ?? session.club.name;
    const card: PlayCard = {
      sessionId: session.id,
      name: session.name,
      clubName: session.club.name,
      venueName,
      startTime: session.startTime,
      scrapedDate: session.scrapedDate,
      spotsLeft,
      totalSpots: session.maxPlayers,
      eventUrl: session.eventUrl,
      matchScore,
      distanceKm,
      fillingFast,
      fillRate,
      friendCount,
      friends,
      topDupr,
      hasFriends: friendCount > 0,
      totalRoster: session._count.rosters,
      duprCount: session.rosters.filter(
        (r) => r.player?.duprDoubles != null && Number(r.player.duprDoubles) > 0,
      ).length,
    };

    const duprCoverageCount = session.rosters.filter(
      (r) => r.player?.duprDoubles != null && Number(r.player.duprDoubles) > 0,
    ).length;

    scored.push({ card, sessionId: session.id, duprCoverageCount });
  }

  scored.sort((a, b) => b.card.matchScore - a.card.matchScore);

  const friendSessionIds = new Set(
    scored.filter((s) => s.card.hasFriends).map((s) => s.sessionId),
  );

  const top5 = scored
    .filter((s) => !friendSessionIds.has(s.sessionId) && s.duprCoverageCount >= 6)
    .slice(0, 5)
    .map((s) => s.card)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return NextResponse.json(
    { top5 },
    { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } },
  );
}
