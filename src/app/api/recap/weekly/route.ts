import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { vietnamNow } from "@/lib/notifications/session-time";
import { getWeekKey } from "@/lib/feed-milestones";

/**
 * GET /api/recap/weekly
 *
 * Returns the player's Circle-this-week recap for the previous Mon–Sun window
 * (in Asia/Ho_Chi_Minh, UTC+7). Shows at most once per week per player.
 *
 * Response: { show: false } | { show: true, weekOf, sessionsPlayed, ... }
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.reclubUserId) return NextResponse.json({ show: false });

  // ── Week window in HCMC time ──────────────────────────────────────────────
  // vietnamNow() returns a Date shifted so getUTC* = Vietnam local time.
  const vnNow = vietnamNow();

  // Mon=1, ..., Sun=0 in JS
  const dayOfWeek = vnNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysSinceMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Monday of the current week (Vietnam midnight)
  const vnCurrentMon = new Date(vnNow);
  vnCurrentMon.setUTCDate(vnCurrentMon.getUTCDate() - daysSinceMon);
  vnCurrentMon.setUTCHours(0, 0, 0, 0);

  // Monday of the previous week (Vietnam midnight)
  const vnPrevMon = new Date(vnCurrentMon);
  vnPrevMon.setUTCDate(vnPrevMon.getUTCDate() - 7);

  // Sunday end of previous week (Vietnam 23:59:59.999)
  const vnPrevSunEnd = new Date(vnCurrentMon);
  vnPrevSunEnd.setUTCMilliseconds(-1);

  // Date strings for scrapedDate (YYYY-MM-DD in Vietnam)
  const prevMonStr = vnPrevMon.toISOString().slice(0, 10);
  const prevSunStr = new Date(vnCurrentMon.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Actual UTC timestamps for kudos.createdAt comparison (remove the 7h shift)
  const OFFSET_MS = 7 * 60 * 60 * 1000;
  const prevMonStartUTC = new Date(vnPrevMon.getTime() - OFFSET_MS);
  const prevSunEndUTC = new Date(vnPrevSunEnd.getTime() - OFFSET_MS);

  // ISO week key for the CURRENT week (stored in preferences to suppress re-show)
  const currentWeekStr = getWeekKey(vnCurrentMon);

  // ── Seen-flag check ───────────────────────────────────────────────────────
  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { id: true, preferences: true },
  });
  if (!profile) return NextResponse.json({ show: false });

  const prefs = (profile.preferences ?? {}) as Record<string, unknown>;
  if (prefs["lastRecapSeenWeek"] === currentWeekStr) {
    return NextResponse.json({ show: false });
  }

  // ── Gather stats for the previous week ───────────────────────────────────
  const myRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: user.reclubUserId,
      session: { scrapedDate: { gte: prevMonStr, lte: prevSunStr } },
    },
    select: {
      sessionId: true,
      session: { select: { club: { select: { name: true } } } },
    },
  });

  const sessionsPlayed = myRosters.length;
  if (sessionsPlayed === 0) return NextResponse.json({ show: false });

  const sessionIds = myRosters.map((r) => r.sessionId);
  const clubNames = myRosters.map((r) => r.session.club.name);

  // clubs visited (case-insensitive distinct count)
  const clubsVisited = new Set(clubNames.map((n) => n.trim().toLowerCase())).size;

  // top club (most sessions)
  const clubFreq = new Map<string, { display: string; count: number }>();
  for (const name of clubNames) {
    const key = name.trim().toLowerCase();
    const entry = clubFreq.get(key) ?? { display: name, count: 0 };
    entry.count++;
    clubFreq.set(key, entry);
  }
  const topClub =
    [...clubFreq.values()].sort((a, b) => b.count - a.count)[0]?.display ?? null;

  // unique co-players
  const coPlayers = await prisma.sessionRoster.findMany({
    where: {
      sessionId: { in: sessionIds },
      userId: { not: user.reclubUserId },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const uniqueCoPlayers = coPlayers.length;

  // kudos received (given to this player during the window)
  const kudosReceived = await prisma.kudos.count({
    where: {
      toPlayerId: user.reclubUserId,
      createdAt: { gte: prevMonStartUTC, lte: prevSunEndUTC },
    },
  });

  // most improved followee — optional; skip if no DUPR data
  let mostImproved: { displayName: string | null; improvement: number } | null = null;
  try {
    const follows = await prisma.follow.findMany({
      where: { followerId: user.profileId },
      select: { followeeId: true },
    });
    if (follows.length > 0) {
      const followeeIds = follows.map((f) => f.followeeId);
      const duprHistory = await prisma.playerDuprHistory.findMany({
        where: {
          playerId: { in: followeeIds },
          recordedAt: { gte: prevMonStartUTC, lte: prevSunEndUTC },
        },
        orderBy: { recordedAt: "desc" },
        include: { player: { select: { displayName: true } } },
      });
      const duprByPlayer = new Map<bigint, { first: number; last: number; name: string | null }>();
      for (const row of duprHistory) {
        if (!row.duprDoubles) continue;
        const val = Number(row.duprDoubles);
        const entry = duprByPlayer.get(row.playerId);
        if (!entry) {
          duprByPlayer.set(row.playerId, {
            first: val,
            last: val,
            name: row.player.displayName,
          });
        } else {
          entry.last = val; // ordered desc, so last inserted = earliest in week
        }
      }
      let bestImprovement = 0;
      for (const [, e] of duprByPlayer) {
        const improvement = e.first - e.last; // first=latest, last=earliest → improvement
        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          mostImproved = { displayName: e.name, improvement };
        }
      }
    }
  } catch {
    // mostImproved is optional — swallow any error
  }

  // ── Set seen flag + return ────────────────────────────────────────────────
  // Must await: on Vercel the isolate can freeze as soon as the response is
  // sent, so a fire-and-forget update often never lands — card would reappear
  // on every cold start.
  await prisma.playerProfile.update({
    where: { id: profile.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { preferences: { ...prefs, lastRecapSeenWeek: currentWeekStr } as any },
  });

  return NextResponse.json({
    show: true,
    weekOf: `${prevMonStr} – ${prevSunStr}`,
    sessionsPlayed,
    uniqueCoPlayers,
    kudosReceived,
    clubsVisited,
    topClub,
    mostImproved,
  });
}
