import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  vnCalendarDateString,
  haversineKm,
  deriveVibeTag,
  isFillingFast,
  reclubAvatarUrl,
} from "@/lib/utils";
import { CACHE_CONTROL_SESSIONS } from "@/lib/http-cache-headers";

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
    const date = searchParams.get("date") ?? vnCalendarDateString(0);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const userLat = Number.isFinite(lat) ? lat : null;
    const userLng = Number.isFinite(lng) ? lng : null;

    const sessions = await prisma.session.findMany({
      where: { scrapedDate: date, status: "active" },
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
        },
      },
      orderBy: { startTime: "asc" },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { sessions: [], count: 0 },
        { headers: { "Cache-Control": CACHE_CONTROL_SESSIONS } },
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

        eventUrl: s.eventUrl,
      };
    });

    return NextResponse.json(
      { sessions: mapped, count: mapped.length },
      { headers: { "Cache-Control": CACHE_CONTROL_SESSIONS } },
    );
  } catch (err) {
    console.error("[GET /api/sessions/swipe-deck]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
