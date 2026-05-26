import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

// Streak is recomputed at most once per day.
// Stored in player_profiles.streak_data (JSON) + streak_computed_at (timestamp).
// ?refresh=1 forces a recompute regardless of age.
const STREAK_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface StreakResult {
  currentStreak: number
  weeklyPlayed: boolean[]
  circleSessionsThisWeek: number
  mySessionsThisWeek: number
  streakStartDate: string | null
}

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.reclubUserId) {
    return NextResponse.json({
      currentStreak: 0,
      weeklyPlayed: [],
      circleSessionsThisWeek: 0,
      mySessionsThisWeek: 0,
      streakStartDate: null,
    });
  }

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1'

  // Read existing cached streak from DB
  if (!forceRefresh) {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: user.profileId },
      select: { streakData: true, streakComputedAt: true },
    })

    if (
      profile?.streakData &&
      profile.streakComputedAt &&
      Date.now() - profile.streakComputedAt.getTime() < STREAK_TTL_MS
    ) {
      return NextResponse.json({ ...(profile.streakData as StreakResult), cached: true })
    }
  }

  // --- Compute streak ---
  const now = new Date();
  const weeksToCheck = 12;

  const sessions = await prisma.sessionRoster.findMany({
    where: { userId: user.reclubUserId },
    select: { scrapedAt: true, session: { select: { scrapedDate: true } } },
    orderBy: { scrapedAt: "desc" },
    take: 200,
  });

  const getWeekNumber = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
    );
  };

  const weeksWithSessions = new Set(
    sessions.map((s) => {
      const d = s.session.scrapedDate
        ? new Date(s.session.scrapedDate)
        : s.scrapedAt;
      return `${d.getFullYear()}-${getWeekNumber(d)}`;
    })
  );

  let streak = 0;
  let missedWeeks = 0;
  const MAX_MISSED = 1;
  const weeklyPlayed: boolean[] = [];

  for (let i = 0; i < weeksToCheck; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - i * 7);
    const weekKey = `${checkDate.getFullYear()}-${getWeekNumber(checkDate)}`;
    const played = weeksWithSessions.has(weekKey);

    if (i < 6) weeklyPlayed.push(played);

    if (played) {
      streak++;
      missedWeeks = 0;
    } else {
      missedWeeks++;
      if (i === 0) continue;
      if (missedWeeks > MAX_MISSED) break;
    }
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true },
  });
  const followeeIds = follows.map((f) => f.followeeId);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const circleSessionsThisWeek =
    followeeIds.length > 0
      ? await prisma.sessionRoster.count({
          where: {
            userId: { in: followeeIds },
            scrapedAt: { gte: weekStart },
          },
        })
      : 0;

  const mySessionsThisWeek = await prisma.sessionRoster.count({
    where: {
      userId: user.reclubUserId,
      scrapedAt: { gte: weekStart },
    },
  });

  const result: StreakResult = {
    currentStreak: streak,
    weeklyPlayed: weeklyPlayed.reverse(),
    circleSessionsThisWeek,
    mySessionsThisWeek,
    streakStartDate:
      streak > 0
        ? (sessions[sessions.length - 1]?.scrapedAt?.toISOString() ?? null)
        : null,
  }

  // Persist to DB (fire-and-forget — don't block the response)
  prisma.playerProfile.update({
    where: { id: user.profileId },
    data: { streakData: result, streakComputedAt: now },
  }).catch((e) => console.error("[streak] failed to persist:", e))

  return NextResponse.json(result);
}
