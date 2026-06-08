import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import {
  reclubAvatarUrl,
  vnCalendarDateString,
  vnCurrentTimeString,
  haversineKm,
  isFillingFast,
  deriveVibeTag,
} from "@/lib/utils";
import { CACHE_CONTROL_PRIVATE } from "@/lib/http-cache-headers";
import { calculateMatchScore } from "@/lib/match-score";

const RANGE_KM = 10;

// Cached session query — TTL 10 min. Does NOT include minTime (applied in-memory
// post-retrieval) so all users hitting the same date+geo bucket share one DB hit.
// Geo bounds are rounded to 2dp before being used as cache key args to avoid
// cache thrashing from minor GPS jitter between requests.
const getCachedSessions = unstable_cache(
  async (
    dateStr: string,
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
    market: string = "hcm",
  ) => {
    const geoFilter =
      minLat !== 0 || maxLat !== 0
        ? {
            venue: {
              latitude: { gte: minLat, lte: maxLat },
              longitude: { gte: minLng, lte: maxLng },
            },
          }
        : {};
    const sessions = await prisma.session.findMany({
      where: {
        scrapedDate: dateStr,
        status: "active",
        club: { market },
        ...geoFilter,
      },
      include: {
        club: { select: { name: true, slug: true } },
        venue: { select: { name: true, latitude: true, longitude: true } },
        duprStat: true,
        snapshots: { orderBy: { scrapedAt: "desc" }, take: 2 },
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
          orderBy: { player: { duprDoubles: "desc" } },
        },
        _count: { select: { rosters: true } },
      },
      orderBy: { startTime: "asc" },
    });
    // Serialize BigInt/Decimal before caching — JSON.stringify cannot handle them.
    return sessions.map((s) => ({
      ...s,
      duprStat: s.duprStat
        ? {
            ...s.duprStat,
            avgDuprDoubles: s.duprStat.avgDuprDoubles != null
              ? Number(s.duprStat.avgDuprDoubles)
              : null,
            returningPlayerPct: s.duprStat.returningPlayerPct != null
              ? Number(s.duprStat.returningPlayerPct)
              : null,
            duprParticipationPct: s.duprStat.duprParticipationPct != null
              ? Number(s.duprStat.duprParticipationPct)
              : null,
          }
        : null,
      rosters: s.rosters.map((r) => ({
        ...r,
        userId: r.userId.toString(),
        player: r.player
          ? {
              ...r.player,
              userId: r.player.userId.toString(),
              duprDoubles: r.player.duprDoubles != null
                ? Number(r.player.duprDoubles)
                : null,
            }
          : null,
      })),
    }));
  },
  ["play-sessions"],
  { revalidate: 600 },
);

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
  duprRange: { min: number; max: number } | null;
  returningPlayerPct: number | null;
  vibeTag: string;
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
  const marketParam = searchParams.get("market") ?? "hcm";
  const market = marketParam === "kl" ? "kl" : "hcm";
  const today = vnCalendarDateString(0);
  const tomorrow = vnCalendarDateString(1);
  const dateStr = filter === "tomorrow" ? tomorrow : today;
  const minTime = filter === "today" ? vnCurrentTimeString() : undefined;

  const userLat = Number.isFinite(lat) ? lat : null;
  const userLng = Number.isFinite(lng) ? lng : null;

  // Bounding-box pre-filter: reduces rows returned before the precise JS haversine check.
  // Rounded to 2dp so nearby users share the same cache bucket (avoids GPS jitter misses).
  // venueId-null sessions still pass through — the geo filter only constrains rows where
  // venue IS set, and those without a venue are handled by the JS distance wall.
  const hasPreciseLocation = lat !== 0 && lng !== 0 && Number.isFinite(lat) && Number.isFinite(lng);
  const GEO_KM = 5;
  const latDelta = GEO_KM / 111;
  const lngDelta = GEO_KM / (111 * Math.cos((lat * Math.PI) / 180));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const cacheMinLat = hasPreciseLocation ? round2(lat - latDelta) : 0;
  const cacheMaxLat = hasPreciseLocation ? round2(lat + latDelta) : 0;
  const cacheMinLng = hasPreciseLocation ? round2(lng - lngDelta) : 0;
  const cacheMaxLng = hasPreciseLocation ? round2(lng + lngDelta) : 0;

  const [userProfile, follows, allSessions, blockingRaw, blockedByRaw] = await Promise.all([
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
    getCachedSessions(dateStr, cacheMinLat, cacheMaxLat, cacheMinLng, cacheMaxLng, market),
    user?.profileId
      ? prisma.block.findMany({
          where: { blockerId: user.profileId },
          select: { blocked: { select: { reclubUserId: true } } },
        })
      : Promise.resolve([]),
    user?.profileId && user?.reclubUserId
      ? prisma.block.findMany({
          where: { blockedId: user.profileId },
          select: { blocker: { select: { reclubUserId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const blockedReclubIds = new Set<string>([
    ...(blockingRaw as Array<{ blocked: { reclubUserId: bigint | null } }>).flatMap((b) =>
      b.blocked.reclubUserId ? [b.blocked.reclubUserId.toString()] : [],
    ),
    ...(blockedByRaw as Array<{ blocker: { reclubUserId: bigint | null } }>).flatMap((b) =>
      b.blocker.reclubUserId ? [b.blocker.reclubUserId.toString()] : [],
    ),
  ]);

  // Resolve effective user DUPR: prefer Reclub DUPR, fall back to manual onboarding DUPR
  let effectiveUserDupr: number | null = null;
  const reclubDupr = userProfile?.duprDoubles ? Number(userProfile.duprDoubles) : null;
  if (reclubDupr && reclubDupr > 0) {
    effectiveUserDupr = reclubDupr;
  } else if (user?.profileId) {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: user.profileId },
      select: { preferences: true },
    });
    const prefs = (profile?.preferences as Record<string, unknown>) ?? {};
    const manualDupr = typeof prefs.dupr === "number" ? prefs.dupr : null;
    if (manualDupr && manualDupr > 0) {
      effectiveUserDupr = manualDupr;
    }
  }

  // Apply minTime filter in-memory (not in DB query so cache is shared across all request times)
  const sessions = minTime
    ? allSessions.filter((s) => s.startTime >= minTime)
    : allSessions;

  const followeeIds = new Set(
    follows
      .map((f) => f.followeeId.toString())
      .filter((id) => !blockedReclubIds.has(id)),
  );

  type Scored = {
    card: PlayCard;
    sessionId: number;
    duprCoverageCount: number;
    avgDupr: number;
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
        imageUrl: r.player?.imageUrl ?? reclubAvatarUrl(BigInt(uid)),
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
            r.player?.imageUrl ?? reclubAvatarUrl(BigInt(r.player?.userId ?? r.userId)),
          duprDoubles: Number(r.player!.duprDoubles),
          isFollowing: followeeIds.has(uid),
        };
      });

    const matchScore = calculateMatchScore({
      userDupr: effectiveUserDupr,
      sessionAvgDupr: session.duprStat?.avgDuprDoubles
        ? Number(session.duprStat.avgDuprDoubles)
        : null,
      fillRate: Math.min(1, joined / Math.max(session.maxPlayers, 1)),
      returningPlayerPct: session.duprStat?.returningPlayerPct
        ? Number(session.duprStat.returningPlayerPct)
        : null,
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
      duprRange: (() => {
        const vals = session.rosters
          .map((r) => r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null)
          .filter((v): v is number => v !== null && v > 0);
        if (vals.length >= 2) return { min: Math.round(Math.min(...vals) * 10) / 10, max: Math.round(Math.max(...vals) * 10) / 10 };
        return null;
      })(),
      returningPlayerPct: session.duprStat?.returningPlayerPct != null
        ? Math.min(100, Number(session.duprStat.returningPlayerPct))
        : null,
      vibeTag: deriveVibeTag(
        session.name,
        session.skillLevelMin,
        session.duprStat?.duprParticipationPct != null ? Number(session.duprStat.duprParticipationPct) : null,
      ),
    };

    const duprCoverageCount = session.rosters.filter(
      (r) => r.player?.duprDoubles != null && Number(r.player.duprDoubles) > 0,
    ).length;

    const avgDupr = session.duprStat?.avgDuprDoubles != null
      ? Math.round(Number(session.duprStat.avgDuprDoubles) * 10) / 10
      : 0;

    scored.push({ card, sessionId: session.id, duprCoverageCount, avgDupr });
  }

  scored.sort((a, b) => b.card.matchScore - a.card.matchScore);

  const friendSessionIds = new Set(
    scored.filter((s) => s.card.hasFriends).map((s) => s.sessionId),
  );

  const eligible = scored.filter(
    (s) =>
      !friendSessionIds.has(s.sessionId) &&
      s.duprCoverageCount >= 4 &&
      s.card.totalRoster >= 15,
  );

  // Compute per-slot max avg DUPR from eligible sessions (ignores duprMin so
  // the user can see the ceiling available when adjusting the slider)
  const slotStats: Record<"morning" | "afternoon" | "evening", number | null> = {
    morning: null,
    afternoon: null,
    evening: null,
  };
  for (const s of eligible) {
    if (s.avgDupr <= 0) continue;
    const h = parseInt(s.card.startTime.split(":")[0] ?? "12", 10);
    const slot: "morning" | "afternoon" | "evening" =
      h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    if (slotStats[slot] === null || s.avgDupr > slotStats[slot]!) {
      slotStats[slot] = s.avgDupr;
    }
  }

  // Apply duprMin filter for the final top 5 selection
  const duprFiltered = duprMin > 0
    ? eligible.filter((s) => s.avgDupr >= Math.round(duprMin * 10) / 10)
    : eligible;

  const top5 = duprFiltered
    .slice(0, 5)
    .map((s) => s.card)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return NextResponse.json(
    { top5, slotStats },
    { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } },
  );
}
