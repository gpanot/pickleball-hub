import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  vnCalendarDateString,
  vnCurrentTimeString,
  haversineKm,
  deriveVibeTag,
  isFillingFast,
  reclubAvatarUrl,
} from "@/lib/utils";
import { CACHE_CONTROL_PRIVATE } from "@/lib/http-cache-headers";
import { getMobileUser } from "@/lib/mobile-auth";

const ROSTER_CAP = 10;
const REGULARS_CAP = 5;

/**
 * GET /api/sessions/swipe-deck?date=YYYY-MM-DD&lat=10.78&lng=106.69
 *
 * Returns sessions shaped for the mobile swipe card, including:
 * roster, regulars, vibeTag, fillingFast, joinedRecently, distanceKm, duprRange.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const today = vnCalendarDateString(0);
    const date = searchParams.get("date") ?? today;
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");

    // For today, hide sessions that have already started (or ended).
    // Tomorrow and beyond: show everything.
    const minTime = date === today ? vnCurrentTimeString() : undefined;
    const userLat = Number.isFinite(lat) ? lat : null;
    const userLng = Number.isFinite(lng) ? lng : null;

    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : null;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Resolve followed player IDs for the authenticated mobile user
    const mobileUser = await getMobileUser(req);
    let followedPlayerIds: Set<string> = new Set();
    if (mobileUser?.profileId) {
      const follows = await prisma.follow.findMany({
        where: { followerId: mobileUser.profileId },
        select: { followeeId: true },
      });
      followedPlayerIds = new Set(follows.map((f) => f.followeeId.toString()));
    }

    const sessionWhere = {
      scrapedDate: date,
      status: "active",
      ...(minTime ? { startTime: { gte: minTime } } : {}),
    };

    // Build a full friend-presence map for the whole day — not limited to the current page.
    // This ensures friend sessions are visible regardless of their position in the paginated deck.
    const FRIENDS_AVATAR_CAP = 4;
    const friendsBySessionId = new Map<number, { userId: string; displayName: string; imageUrl: string; duprDoubles: number | null }[]>();
    if (followedPlayerIds.size > 0) {
      const friendRosterRows = await prisma.sessionRoster.findMany({
        where: {
          userId: { in: [...followedPlayerIds].map(BigInt) },
          isConfirmed: true,
          session: sessionWhere,
        },
        select: {
          sessionId: true,
          userId: true,
          player: { select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true } },
        },
      });
      for (const r of friendRosterRows) {
        const uid = r.player?.userId ?? r.userId;
        const entry = {
          userId: uid.toString(),
          displayName: r.player?.displayName ?? "Player",
          imageUrl: r.player?.imageUrl ?? reclubAvatarUrl(uid),
          duprDoubles: r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null,
        };
        const list = friendsBySessionId.get(r.sessionId);
        if (list) {
          // Deduplicate by userId
          if (!list.some((f) => f.userId === entry.userId)) list.push(entry);
        } else {
          friendsBySessionId.set(r.sessionId, [entry]);
        }
      }
    }

    const friendSessionIds = [...friendsBySessionId.keys()];

    console.log(`[swipe-deck] date=${date} minTime=${minTime ?? "none"} offset=${offset} limit=${limit} friendSessions=${friendSessionIds.length}`);

    const sessionInclude = {
      club: { select: { name: true, slug: true } },
      venue: { select: { name: true, latitude: true, longitude: true } },
      duprStat: true,
      snapshots: { orderBy: { scrapedAt: "desc" } as const, take: 2 },
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
    } as const;

    // On the first page, always prepend friend sessions regardless of their startTime rank.
    // For subsequent pages, exclude friend sessions from the normal paging so they don't repeat.
    const isFirstPage = offset === 0;
    const normalWhere =
      friendSessionIds.length > 0
        ? { ...sessionWhere, id: { notIn: friendSessionIds } }
        : sessionWhere;
    const normalSkip = isFirstPage ? 0 : offset - friendSessionIds.length;
    const normalTake =
      limit !== null
        ? isFirstPage
          ? Math.max(0, limit - friendSessionIds.length)
          : limit
        : null;

    const [totalCount, friendSessions, normalSessions] = await Promise.all([
      prisma.session.count({ where: sessionWhere }),
      isFirstPage && friendSessionIds.length > 0
        ? prisma.session.findMany({
            where: { id: { in: friendSessionIds } },
            include: sessionInclude,
            orderBy: { startTime: "asc" },
          })
        : Promise.resolve([]),
      prisma.session.findMany({
        where: normalWhere,
        include: sessionInclude,
        orderBy: { startTime: "asc" },
        ...(normalTake !== null ? { skip: Math.max(0, normalSkip), take: normalTake } : {}),
      }),
    ]);

    // Friend sessions first, then normal sessions (no duplicates)
    const sessions = [...friendSessions, ...normalSessions];

    if (sessions.length === 0) {
      return NextResponse.json(
        { sessions: [], count: 0, total: totalCount, offset, hasMore: false },
        { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } },
      );
    }

    // --- Regulars: players with >= 3 sessions at the same club in past 60 days ---
    const clubIds = [...new Set(sessions.map((s) => s.clubId))];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const regularRows = await prisma.sessionRoster.findMany({
      where: {
        isConfirmed: true,
        isHost: false,
        session: {
          clubId: { in: clubIds },
          scrapedDate: { gte: cutoffStr, lt: date },
        },
      },
      select: {
        userId: true,
        session: { select: { clubId: true, id: true } },
      },
    });

    // Build Map<clubId, Set<userId>> where user appeared in >= 3 distinct sessions
    const clubUserSessions = new Map<number, Map<bigint, Set<number>>>();
    for (const r of regularRows) {
      const cid = r.session.clubId;
      if (!clubUserSessions.has(cid)) clubUserSessions.set(cid, new Map());
      const userMap = clubUserSessions.get(cid)!;
      if (!userMap.has(r.userId)) userMap.set(r.userId, new Set());
      userMap.get(r.userId)!.add(r.session.id);
    }

    const regularsByClub = new Map<number, Set<bigint>>();
    for (const [cid, userMap] of clubUserSessions) {
      const regulars = new Set<bigint>();
      for (const [uid, sessionIds] of userMap) {
        if (sessionIds.size >= 3) regulars.add(uid);
      }
      regularsByClub.set(cid, regulars);
    }

    // --- Map each session ---
    const mapped = sessions.map((s) => {
      const snap0 = s.snapshots[0];
      const snap1 = s.snapshots[1];
      const joined = snap0?.joined ?? 0;
      const joinedPrev = snap1?.joined ?? 0;
      const joinedRecently = Math.max(0, joined - joinedPrev);
      const spotsLeft = Math.max(0, s.maxPlayers - joined);
      const fillRate = s.maxPlayers > 0 ? joined / s.maxPlayers : 0;

      const duprPct = s.duprStat
        ? Number(s.duprStat.duprParticipationPct)
        : null;

      const vibeTag = deriveVibeTag(s.name, s.skillLevelMin, duprPct);
      const fillingFast = isFillingFast(fillRate, joinedRecently);

      let distanceKm: number | null = null;
      if (
        userLat !== null &&
        userLng !== null &&
        s.venue?.latitude != null &&
        s.venue?.longitude != null
      ) {
        distanceKm =
          Math.round(
            haversineKm(userLat, userLng, s.venue.latitude, s.venue.longitude) *
              10,
          ) / 10;
      }

      // DUPR range: prefer actual roster DUPR values, fall back to session-level fields
      let duprRange: { min: number; max: number } | null = null;
      const duprVals = s.rosters
        .map((r) =>
          r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null,
        )
        .filter((v): v is number => v !== null && v > 0);

      if (duprVals.length >= 2) {
        duprRange = {
          min: Math.round(Math.min(...duprVals) * 10) / 10,
          max: Math.round(Math.max(...duprVals) * 10) / 10,
        };
      } else if (s.skillLevelMin != null && s.skillLevelMax != null) {
        duprRange = { min: s.skillLevelMin, max: s.skillLevelMax };
      } else if (
        s.duprStat?.avgDuprDoubles != null
      ) {
        const avg = Number(s.duprStat.avgDuprDoubles);
        duprRange = {
          min: Math.round((avg - 0.3) * 10) / 10,
          max: Math.round((avg + 0.3) * 10) / 10,
        };
      }

      // Roster for card display
      const clubRegulars = regularsByClub.get(s.clubId) ?? new Set<bigint>();

      const roster = s.rosters.slice(0, ROSTER_CAP).map((r) => ({
        displayName: r.player?.displayName ?? "Player",
        imageUrl:
          r.player?.imageUrl ?? reclubAvatarUrl(r.player?.userId ?? r.userId),
        duprDoubles:
          r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null,
        isHost: r.isHost,
      }));

      const regulars = s.rosters
        .filter((r) => !r.isHost && clubRegulars.has(r.userId))
        .slice(0, REGULARS_CAP)
        .map((r) => ({
          displayName: r.player?.displayName ?? "Player",
          imageUrl:
            r.player?.imageUrl ?? reclubAvatarUrl(r.player?.userId ?? r.userId),
        }));

      return {
        id: s.id,
        referenceCode: s.referenceCode,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMin: s.durationMin,
        maxPlayers: s.maxPlayers,
        feeAmount: s.feeAmount,
        feeCurrency: s.feeCurrency,

        joined,
        spotsLeft,
        fillRate: Math.round(fillRate * 100) / 100,
        fillingFast,
        joinedRecently,
        matchScore: 0,
        distanceKm,
        vibeTag,

        duprRange,

        venue: s.venue
          ? {
              name: s.venue.name,
              latitude: s.venue.latitude,
              longitude: s.venue.longitude,
            }
          : null,
        club: s.club,

        roster,
        regulars,

        ...(() => {
          const friendsInSession = friendsBySessionId.get(s.id) ?? [];
          const friendCount = friendsInSession.length;
          return {
            friends: friendsInSession.slice(0, FRIENDS_AVATAR_CAP),
            friendCount,
            friendsOverflow: Math.max(0, friendCount - FRIENDS_AVATAR_CAP),
          };
        })(),

        eventUrl: s.eventUrl,
      };
    });

    const hasMore = limit !== null ? offset + sessions.length < totalCount : false;

    const friendSessionsLogged = mapped.filter((s) => s.friendCount > 0);
    console.log(`[swipe-deck] total=${totalCount} returned=${mapped.length} withFriends=${friendSessionsLogged.length}`);
    friendSessionsLogged.forEach((s) => {
      console.log(`  → [FRIENDS] "${s.name}" startTime=${s.startTime} friendCount=${s.friendCount} friends=${s.friends.map((f) => f.displayName).join(", ")}`);
    });

    return NextResponse.json(
      { sessions: mapped, count: mapped.length, total: totalCount, offset, hasMore },
      { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } },
    );
  } catch (err) {
    console.error("[GET /api/sessions/swipe-deck]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
