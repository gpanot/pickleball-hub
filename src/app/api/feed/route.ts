import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";

function toPlayerPayload(p: {
  userId: bigint;
  displayName: string | null;
  imageUrl: string | null;
  duprDoubles: any;
}) {
  return {
    userId: p.userId.toString(),
    displayName: p.displayName,
    imageUrl: p.imageUrl ?? reclubAvatarUrl(p.userId),
    duprDoubles: p.duprDoubles ? Number(p.duprDoubles) : null,
  };
}

/**
 * GET /api/feed
 *
 * Returns a chronological feed of activity from players the user follows:
 *   - "played" items: followees who attended sessions in the last 30 days
 *   - "joining" items: followees on upcoming session rosters (today or future scrapedDates)
 *
 * Sorted: joining first, then by timestamp desc. Max 2 items per player, 20 total.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true },
  });

  if (follows.length === 0) {
    return NextResponse.json({ items: [], hasFollows: false });
  }

  const followeeIds = follows.map((f) => f.followeeId);
  const items: any[] = [];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 30 days ago as YYYY-MM-DD for scrapedDate comparison
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cutoffStr = thirtyDaysAgo.toISOString().slice(0, 10);

  // "joining" — followee is on the roster of an upcoming session (scrapedDate >= today)
  const upcomingRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: { scrapedDate: { gte: todayStr } },
    },
    include: {
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      },
      session: {
        select: {
          id: true,
          name: true,
          startTime: true,
          scrapedDate: true,
          eventUrl: true,
          maxPlayers: true,
          club: { select: { name: true } },
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { session: { startTime: "asc" } },
    take: 15,
  });

  for (const r of upcomingRosters) {
    const joined = r.session.snapshots[0]?.joined ?? 0;
    const spotsLeft = Math.max(0, r.session.maxPlayers - joined);

    items.push({
      id: `joining_${r.userId}_${r.sessionId}`,
      type: "joining",
      player: toPlayerPayload(r.player),
      isFollowing: true,
      timestamp: `${r.session.scrapedDate}T${r.session.startTime}:00`,
      sessionName: r.session.name,
      venueName: r.session.club.name,
      sessionTime: `${r.session.scrapedDate}T${r.session.startTime}:00`,
      spotsLeft,
      sessionId: r.session.id,
      eventUrl: r.session.eventUrl,
    });
  }

  // "played" — followee attended a session in last 30 days (scrapedDate < today)
  const recentRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: {
        scrapedDate: { gte: cutoffStr, lt: todayStr },
      },
    },
    include: {
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      },
      session: {
        select: {
          startTime: true,
          scrapedDate: true,
          club: { select: { name: true } },
        },
      },
    },
    orderBy: { session: { scrapedDate: "desc" } },
    take: 40,
  });

  // Also include today's sessions that have already ended (endTime <= nowTime in VN)
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const nowTimeVN = vnNow.toISOString().slice(11, 16); // HH:mm

  const todayCompletedRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: {
        scrapedDate: todayStr,
        endTime: { lte: nowTimeVN },
      },
    },
    include: {
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      },
      session: {
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          scrapedDate: true,
          club: { select: { name: true } },
        },
      },
    },
    orderBy: { session: { startTime: "desc" } },
    take: 20,
  });

  // played_today: distinct item per (followee, session) for sessions finished today
  const seenTodayKeys = new Set<string>();
  for (const r of todayCompletedRosters) {
    const key = `${r.userId}_${r.sessionId}`;
    if (seenTodayKeys.has(key)) continue;
    seenTodayKeys.add(key);
    items.push({
      id: `played_today_${r.userId}_${r.sessionId}`,
      type: "played_today",
      player: toPlayerPayload(r.player),
      isFollowing: true,
      timestamp: `${r.session.scrapedDate}T${r.session.startTime}:00`,
      venueName: r.session.club.name,
      sessionId: r.session.id,
    });
  }

  // Group past sessions (not today) by player+club for "played" aggregated items
  const playedMap = new Map<
    string,
    {
      player: ReturnType<typeof toPlayerPayload>;
      venueName: string;
      count: number;
      lastSeen: string;
    }
  >();

  for (const r of recentRosters) {
    const key = `${r.userId}_${r.session.club.name}`;
    const existing = playedMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      playedMap.set(key, {
        player: toPlayerPayload(r.player),
        venueName: r.session.club.name,
        count: 1,
        lastSeen: `${r.session.scrapedDate}T${r.session.startTime}:00`,
      });
    }
  }

  for (const [, v] of playedMap) {
    items.push({
      id: `played_${v.player.userId}_${v.venueName}`,
      type: "played",
      player: v.player,
      isFollowing: true,
      timestamp: v.lastSeen,
      venueName: v.venueName,
      sessionCount: v.count,
    });
  }

  // "you_are_playing": current user is on a live session right now
  if (user.reclubUserId) {
    const myLiveRoster = await prisma.sessionRoster.findFirst({
      where: {
        userId: user.reclubUserId,
        session: {
          scrapedDate: todayStr,
          startTime: { lte: nowTimeVN },
          endTime: { gt: nowTimeVN },
        },
      },
      include: {
        session: {
          select: {
            id: true,
            name: true,
            eventUrl: true,
            club: { select: { name: true } },
          },
        },
      },
    });

    if (myLiveRoster) {
      const myProfile = await prisma.player.findUnique({
        where: { userId: user.reclubUserId },
        select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
      });
      if (myProfile) {
        items.push({
          id: `you_are_playing_${myLiveRoster.sessionId}`,
          type: "you_are_playing",
          player: toPlayerPayload(myProfile),
          isFollowing: false,
          timestamp: new Date().toISOString(),
          sessionId: myLiveRoster.session.id,
          sessionName: myLiveRoster.session.name,
          venueName: myLiveRoster.session.club.name,
          eventUrl: myLiveRoster.session.eventUrl,
        });
      }
    }
  }

  const MILESTONE_WEEKS = [4, 8, 12, 26, 52];

  function getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
    );
    return `${d.getFullYear()}-${weekNum}`;
  }

  const now = new Date();

  for (const followeeId of followeeIds) {
    const sessions = await prisma.sessionRoster.findMany({
      where: {
        userId: followeeId,
        session: { scrapedDate: { lt: todayStr } },
      },
      select: { session: { select: { startTime: true, scrapedDate: true } } },
      orderBy: { session: { startTime: "desc" } },
      take: 200,
    });

    const weeksWithSessions = new Set(
      sessions.map((s) =>
        getWeekKey(new Date(`${s.session.scrapedDate}T12:00:00`))
      )
    );

    let streak = 0;
    let missedWeeks = 0;
    const weeklyPlayed: boolean[] = [];

    for (let i = 0; i < 12; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() - i * 7);
      const played = weeksWithSessions.has(getWeekKey(checkDate));
      if (i < 6) weeklyPlayed.push(played);
      if (played) {
        streak++;
        missedWeeks = 0;
      } else {
        missedWeeks++;
        if (i > 0 && missedWeeks > 1) break;
      }
    }

    const isCurrentWeekPlayed = weeksWithSessions.has(getWeekKey(now));

    if (isCurrentWeekPlayed && MILESTONE_WEEKS.includes(streak)) {
      const player = await prisma.player.findUnique({
        where: { userId: followeeId },
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      });

      if (player) {
        items.push({
          id: `streak_${followeeId}_${streak}`,
          type: "streak_milestone",
          player: toPlayerPayload(player),
          isFollowing: true,
          timestamp: new Date().toISOString(),
          streakCount: streak,
          weeklyPlayed: weeklyPlayed.reverse(),
        });
      }
    }
  }

  // "just_followed" — players the current user started following in the last 30 days
  const recentFollowing = await prisma.follow.findMany({
    where: {
      followerId: user.profileId,
      createdAt: { gte: thirtyDaysAgo },
    },
    include: {
      followee: {
        select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const f of recentFollowing) {
    items.push({
      id: `just_followed_${f.followeeId}`,
      type: "just_followed",
      player: toPlayerPayload(f.followee),
      isFollowing: true,
      timestamp: f.createdAt.toISOString(),
    });
  }

  // "new_follower" — players who started following the current user in the last 30 days
  if (user.reclubUserId) {
    const recentFollowers = await prisma.follow.findMany({
      where: {
        followeeId: user.reclubUserId,
        createdAt: { gte: thirtyDaysAgo },
      },
      include: {
        follower: {
          select: {
            id: true,
            reclubPlayer: {
              select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    for (const f of recentFollowers) {
      const p = f.follower.reclubPlayer;
      if (!p) continue;
      items.push({
        id: `new_follower_${f.follower.id}`,
        type: "new_follower",
        player: toPlayerPayload(p),
        isFollowing: false,
        timestamp: f.createdAt.toISOString(),
      });
    }
  }

  // dupr_update — followees whose DUPR improved in the last 30 days
  const duprHistoryItems: typeof items = [];

  for (const followeeId of followeeIds) {
    const history = await prisma.playerDuprHistory.findMany({
      where: { playerId: followeeId },
      orderBy: { recordedAt: "desc" },
      take: 2,
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
    });

    if (history.length < 2) continue;

    const latest = history[0];
    const previous = history[1];

    if (!latest.duprDoubles || !previous.duprDoubles) continue;

    const newVal = Number(latest.duprDoubles);
    const oldVal = Number(previous.duprDoubles);

    if (newVal <= oldVal) continue;

    const daysSince =
      (Date.now() - latest.recordedAt.getTime()) / 86400000;
    if (daysSince > 30) continue;

    duprHistoryItems.push({
      id: `dupr_update_${followeeId}_${latest.id}`,
      type: "dupr_update",
      player: toPlayerPayload(latest.player),
      isFollowing: true,
      timestamp: latest.recordedAt.toISOString(),
      duprOld: oldVal,
      duprNew: newVal,
    });
  }

  items.push(...duprHistoryItems);

  // Sort: you_are_playing first, then joining, then by timestamp desc
  items.sort((a, b) => {
    if (a.type === "you_are_playing") return -1;
    if (b.type === "you_are_playing") return 1;
    if (a.type === "joining" && b.type !== "joining") return -1;
    if (b.type === "joining" && a.type !== "joining") return 1;
    return (
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });

  // Max 2 items per player (follow events + played_today + you_are_playing are exempt)
  const EXEMPT_TYPES = new Set(["just_followed", "new_follower", "played_today", "you_are_playing"]);
  const playerCount = new Map<string, number>();
  const filtered = items.filter((item) => {
    if (EXEMPT_TYPES.has(item.type)) return true;
    const uid = item.player.userId;
    const count = playerCount.get(uid) ?? 0;
    if (count >= 2) return false;
    playerCount.set(uid, count + 1);
    return true;
  });

  const finalItems = filtered.slice(0, 20);

  // Fetch kudos counts for all feed items in one batch
  const feedItemIds = finalItems.map((i) => i.id);
  const [kudosCounts, myKudos] = await Promise.all([
    prisma.kudos.groupBy({
      by: ["feedItemId", "type"],
      where: { feedItemId: { in: feedItemIds } },
      _count: { type: true },
    }),
    prisma.kudos.findMany({
      where: {
        fromPlayerId: user.profileId,
        feedItemId: { in: feedItemIds },
      },
      select: { feedItemId: true, type: true },
    }),
  ]);

  // Build lookup maps
  const countMap = new Map<string, Record<string, number>>();
  for (const row of kudosCounts) {
    if (!row.feedItemId) continue;
    if (!countMap.has(row.feedItemId)) {
      countMap.set(row.feedItemId, { fistbump: 0, flame: 0, star: 0 });
    }
    countMap.get(row.feedItemId)![row.type] = row._count.type;
  }

  const myReactionsMap = new Map<string, string[]>();
  for (const row of myKudos) {
    if (!row.feedItemId) continue;
    if (!myReactionsMap.has(row.feedItemId)) {
      myReactionsMap.set(row.feedItemId, []);
    }
    myReactionsMap.get(row.feedItemId)!.push(row.type);
  }

  const itemsWithKudos = finalItems.map((item) => ({
    ...item,
    kudos: {
      fistbump: countMap.get(item.id)?.fistbump ?? 0,
      flame: countMap.get(item.id)?.flame ?? 0,
      star: countMap.get(item.id)?.star ?? 0,
      myReactions: myReactionsMap.get(item.id) ?? [],
    },
  }));

  return NextResponse.json({
    items: itemsWithKudos,
    hasFollows: true,
  });
}
