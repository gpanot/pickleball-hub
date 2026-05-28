import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import {
  reclubAvatarUrl,
  vnCalendarDateString,
  vnCurrentTimeString,
  haversineKm,
  deriveVibeTag,
  isFillingFast,
} from "@/lib/utils";
import { CACHE_CONTROL_PRIVATE } from "@/lib/http-cache-headers";
import { calculateMatchScore } from "@/lib/match-score";

const ROSTER_CAP = 10;
const FRIENDS_AVATAR_CAP = 4;
const RANGE_KM = 5;

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
};

/**
 * GET /api/play?filter=today|tomorrow&lat=&lng=&saved=1,2,3
 *
 * Combined Play screen payload: top5, friendsGoing, savedSessions, exploreSessions.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const filter = searchParams.get("filter") ?? "today";

  const today = vnCalendarDateString(0);
  const tomorrow = vnCalendarDateString(1);
  const dateStr = filter === "tomorrow" ? tomorrow : today;
  const minTime = filter === "today" ? vnCurrentTimeString() : undefined;

  const userLat = Number.isFinite(lat) ? lat : null;
  const userLng = Number.isFinite(lng) ? lng : null;

  let userProfile: { duprDoubles: import("@prisma/client").Prisma.Decimal | null } | null =
    null;
  if (user.reclubUserId) {
    userProfile = await prisma.player.findUnique({
      where: { userId: user.reclubUserId },
      select: { duprDoubles: true },
    });
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true },
  });
  const followeeIds = new Set(follows.map((f) => f.followeeId.toString()));

  const sessionWhere = {
    scrapedDate: dateStr,
    status: "active" as const,
    ...(minTime ? { startTime: { gte: minTime } } : {}),
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
    },
    _count: { select: { rosters: true } },
  } as const;

  const sessions = await prisma.session.findMany({
    where: sessionWhere,
    include: sessionInclude,
    orderBy: { startTime: "asc" },
  });

  type Scored = {
    card: PlayCard;
    swipe: Record<string, unknown>;
    sessionId: number;
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
      .slice(0, 6)
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
    };

    const duprPct = session.duprStat
      ? Number(session.duprStat.duprParticipationPct)
      : null;
    const vibeTag = deriveVibeTag(
      session.name,
      session.skillLevelMin,
      duprPct,
    );

    const roster = session.rosters.slice(0, ROSTER_CAP).map((r) => {
      const uid = (r.player?.userId ?? r.userId).toString();
      return {
        userId: uid,
        displayName: r.player?.displayName ?? "Player",
        imageUrl:
          r.player?.imageUrl ?? reclubAvatarUrl(r.player?.userId ?? r.userId),
        duprDoubles:
          r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null,
        isHost: r.isHost,
        isFollowing: followeeIds.has(uid),
      };
    });

    let duprRange: { min: number; max: number } | null = null;
    const duprVals = session.rosters
      .map((r) =>
        r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null,
      )
      .filter((v): v is number => v !== null && v > 0);
    if (duprVals.length >= 2) {
      duprRange = {
        min: Math.round(Math.min(...duprVals) * 10) / 10,
        max: Math.round(Math.max(...duprVals) * 10) / 10,
      };
    } else if (session.skillLevelMin != null && session.skillLevelMax != null) {
      duprRange = { min: session.skillLevelMin, max: session.skillLevelMax };
    } else if (session.duprStat?.avgDuprDoubles != null) {
      const avg = Number(session.duprStat.avgDuprDoubles);
      duprRange = {
        min: Math.round((avg - 0.3) * 10) / 10,
        max: Math.round((avg + 0.3) * 10) / 10,
      };
    }

    const swipe = {
      id: session.id,
      referenceCode: session.referenceCode,
      name: session.name,
      startTime: session.startTime,
      endTime: session.endTime,
      durationMin: session.durationMin,
      maxPlayers: session.maxPlayers,
      feeAmount: session.feeAmount,
      feeCurrency: session.feeCurrency,
      joined,
      spotsLeft,
      fillRate: Math.round(fillRate * 100) / 100,
      fillingFast,
      joinedRecently,
      matchScore,
      distanceKm,
      vibeTag,
      duprRange,
      venue: session.venue
        ? {
            name: session.venue.name,
            latitude: session.venue.latitude,
            longitude: session.venue.longitude,
          }
        : null,
      club: session.club,
      roster,
      regulars: [] as { displayName: string; imageUrl: string }[],
      friends: friends.slice(0, FRIENDS_AVATAR_CAP),
      friendCount,
      friendsOverflow: Math.max(0, friendCount - FRIENDS_AVATAR_CAP),
      eventUrl: session.eventUrl,
      scrapedDate: session.scrapedDate,
    };

    scored.push({ card, swipe, sessionId: session.id });
  }

  scored.sort((a, b) => b.card.matchScore - a.card.matchScore);

  const friendsGoing = scored
    .filter((s) => s.card.hasFriends)
    .map((s) => s.card);

  const friendSessionIds = new Set(friendsGoing.map((s) => s.sessionId));

  const top5 = scored
    .filter((s) => !friendSessionIds.has(s.sessionId))
    .slice(0, 5)
    .map((s) => s.card);

  const top5Ids = new Set(top5.map((s) => s.sessionId));

  const exploreSessions = scored
    .filter(
      (s) =>
        !friendSessionIds.has(s.sessionId) && !top5Ids.has(s.sessionId),
    )
    .map((s) => s.swipe);

  const savedParam = searchParams.get("saved");
  const savedIdList = savedParam
    ? savedParam
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => !Number.isNaN(n))
    : [];

  const savedSessions =
    savedIdList.length > 0
      ? scored
          .filter((s) => savedIdList.includes(s.sessionId))
          .map((s) => s.card)
      : [];

  return NextResponse.json(
    {
      top5,
      friendsGoing,
      savedSessions,
      exploreSessions,
    },
    { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } },
  );
}
