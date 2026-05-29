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
 *   - "joining": followees on upcoming session rosters (today or future)
 *   - "played_today": followees who finished a session today
 *   - "played": followees who attended sessions in the last 5 days
 *   - "you_are_playing": current user on a live session
 *   - "just_followed" / "new_follower": recent follow events
 *   - "streak_milestone" / "dupr_update": social milestones
 *
 * Sorted strictly newest-first by timestamp. Max 2 items per player, 20 total.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const before = searchParams.get("before");
  const isPaginating = !!before;

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true },
  });

  if (follows.length === 0) {
    return NextResponse.json({ items: [], hasFollows: false, hasMore: false });
  }

  const followeeIds = follows.map((f) => f.followeeId);
  const items: any[] = [];

  // Read persisted feed items — cursor-paginated when `before` is supplied
  const persistedItems = await prisma.feedItem.findMany({
    where: {
      profileId: user.profileId,
      ...(before ? { timestamp: { lt: new Date(before) } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: 30,
  });

  let liveItems: any[] = [];
  let kudosResult: Array<{ feedItemId: string | null; type: string; _count: { type: number } }> = [];

  if (!isPaginating) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const cutoffStr = fiveDaysAgo.toISOString().slice(0, 10);

  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const nowTimeVN = vnNow.toISOString().slice(11, 16); // HH:mm

  const playerSelect = {
    userId: true,
    displayName: true,
    imageUrl: true,
    duprDoubles: true,
  } as const;

  // Fire all queries in parallel — roster queries, follow events, persisted feed, and live roster
  const [upcomingRosters, recentRosters, todayCompletedRosters, recentFollowing, recentFollowers, myLiveRoster] =
    await Promise.all([
      // "joining" — followees on upcoming sessions
      prisma.sessionRoster.findMany({
        where: {
          userId: { in: followeeIds },
          session: { scrapedDate: { gte: todayStr } },
        },
        include: {
          player: { select: playerSelect },
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
      }),
      // "played" — followees who attended sessions in last 5 days
      prisma.sessionRoster.findMany({
        where: {
          userId: { in: followeeIds },
          session: { scrapedDate: { gte: cutoffStr, lt: todayStr } },
        },
        include: {
          player: { select: playerSelect },
          session: {
            select: {
              startTime: true,
              scrapedDate: true,
              club: { select: { name: true } },
              snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
            },
          },
        },
        orderBy: { session: { scrapedDate: "desc" } },
        take: 40,
      }),
      // "played_today" — followees who finished a session today
      prisma.sessionRoster.findMany({
        where: {
          userId: { in: followeeIds },
          session: { scrapedDate: todayStr, endTime: { lte: nowTimeVN } },
        },
        include: {
          player: { select: playerSelect },
          session: {
            select: {
              id: true,
              name: true,
              startTime: true,
              endTime: true,
              scrapedDate: true,
              club: { select: { name: true } },
              snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
            },
          },
        },
        orderBy: { session: { startTime: "desc" } },
        take: 20,
      }),
      // "just_followed" — players the user recently followed
      prisma.follow.findMany({
        where: {
          followerId: user.profileId,
          createdAt: { gte: fiveDaysAgo },
        },
        include: { followee: { select: playerSelect } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // "new_follower" — players who recently followed the user
      user.reclubUserId
        ? prisma.follow.findMany({
            where: {
              followeeId: user.reclubUserId,
              createdAt: { gte: fiveDaysAgo },
            },
            include: {
              follower: {
                select: {
                  id: true,
                  reclubPlayer: { select: playerSelect },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      // "you_are_playing" — current user on a live session right now
      user.reclubUserId
        ? prisma.sessionRoster.findFirst({
            where: {
              userId: user.reclubUserId,
              session: {
                scrapedDate: todayStr,
                startTime: { lte: nowTimeVN },
              },
            },
            include: {
              session: {
                select: {
                  id: true,
                  name: true,
                  eventUrl: true,
                  startTime: true,
                  endTime: true,
                  durationMin: true,
                  club: { select: { name: true } },
                  snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
                },
              },
            },
            orderBy: { session: { startTime: "desc" } },
          })
        : Promise.resolve(null),
    ]);

  // ── Joining items ────────────────────────────────────────────────────────────
  for (const r of upcomingRosters) {
    const joined = r.session.snapshots[0]?.joined ?? 0;
    const spotsLeft = Math.max(0, r.session.maxPlayers - joined);

    items.push({
      id: `joining_${r.userId}_${r.sessionId}`,
      type: "joining",
      player: toPlayerPayload(r.player),
      isFollowing: true,
      timestamp: r.firstSeenAt?.toISOString()
        ?? new Date().toISOString(),
      sessionName: r.session.name,
      venueName: r.session.club.name,
      sessionTime: `${r.session.scrapedDate}T${r.session.startTime}:00+07:00`,
      spotsLeft,
      sessionId: r.session.id,
      eventUrl: r.session.eventUrl,
    });
  }

  // ── Played_today items ───────────────────────────────────────────────────────
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
      timestamp: r.session.snapshots?.[0]?.scrapedAt?.toISOString()
        ?? `${r.session.scrapedDate}T${r.session.startTime}:00+07:00`,
      venueName: r.session.club.name,
      sessionId: r.session.id,
    });
  }

  // ── Played items (past sessions grouped by player+club) ──────────────────────
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
        lastSeen: r.session.snapshots?.[0]?.scrapedAt?.toISOString()
          ?? `${r.session.scrapedDate}T${r.session.startTime}:00+07:00`,
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

  // ── You are playing ──────────────────────────────────────────────────────────
  // myLiveRoster was fetched in the top-level Promise.all above.
  // Primary check: startTime <= now < endTime (exact window).
  // Fallback: session started today and durationMin covers the current time,
  // to handle sessions with a missing or stale endTime string.
  if (myLiveRoster) {
    const sess = myLiveRoster.session;
    // Derive effective endTime: prefer DB value, fall back to startTime + durationMin
    let isLive = false;
    if (sess.endTime) {
      isLive = sess.endTime > nowTimeVN;
    } else if (sess.durationMin) {
      const [sh, sm] = sess.startTime.split(":").map(Number);
      const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
      const [nh, nm] = nowTimeVN.split(":").map(Number);
      const nowMinutes = (nh ?? 0) * 60 + (nm ?? 0);
      isLive = nowMinutes < startMinutes + sess.durationMin;
    } else {
      // No end info — treat as live for 2 hours after start
      const [sh, sm] = sess.startTime.split(":").map(Number);
      const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
      const [nh, nm] = nowTimeVN.split(":").map(Number);
      const nowMinutes = (nh ?? 0) * 60 + (nm ?? 0);
      isLive = nowMinutes < startMinutes + 120;
    }

    if (isLive) {
      const myProfile = await prisma.player.findUnique({
        where: { userId: user.reclubUserId! },
        select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
      });
      if (myProfile) {
        items.push({
          id: `you_are_playing_${myLiveRoster.sessionId}`,
          type: "you_are_playing",
          player: toPlayerPayload(myProfile),
          isFollowing: false,
          timestamp: sess.snapshots?.[0]?.scrapedAt?.toISOString()
            ?? `${todayStr}T${sess.startTime}:00+07:00`,
          sessionId: sess.id,
          sessionName: sess.name,
          venueName: sess.club.name,
          eventUrl: sess.eventUrl,
        });
      }
    }
  }

  // ── Streaks, DUPR history, and follow events — run in parallel ───────────────
  // These three are completely independent: no shared mutable state, different tables.
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

  // Hard cap: skip streak computation if user follows too many people — too slow
  const streakFollowees = followeeIds.slice(0, 10);
  const shouldComputeStreaks = followeeIds.length <= 30;

  async function computeStreaks() {
    if (!shouldComputeStreaks || streakFollowees.length === 0) return [];
    const streakCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const streakCutoffStr = streakCutoff.toISOString().slice(0, 10);

    const allStreakRosters = await prisma.sessionRoster.findMany({
      where: {
        userId: { in: streakFollowees },
        session: { scrapedDate: { gte: streakCutoffStr, lt: todayStr } },
      },
      select: {
        userId: true,
        session: { select: { startTime: true, scrapedDate: true } },
      },
      orderBy: { session: { startTime: "desc" } },
    });

    const rostersByFollowee = new Map<bigint, typeof allStreakRosters>();
    for (const r of allStreakRosters) {
      const list = rostersByFollowee.get(r.userId) ?? [];
      list.push(r);
      rostersByFollowee.set(r.userId, list);
    }

    const milestoneFolloweeIds: bigint[] = [];
    const milestoneData = new Map<bigint, { streak: number; weeklyPlayed: boolean[]; sessions: typeof allStreakRosters }>();

    for (const followeeId of streakFollowees) {
      const sessions = rostersByFollowee.get(followeeId) ?? [];
      const weeksWithSessions = new Set(
        sessions.map((s) => getWeekKey(new Date(`${s.session.scrapedDate}T12:00:00`)))
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
        milestoneFolloweeIds.push(followeeId);
        milestoneData.set(followeeId, { streak, weeklyPlayed, sessions });
      }
    }

    if (milestoneFolloweeIds.length === 0) return [];

    const milestonePlayers = await prisma.player.findMany({
      where: { userId: { in: milestoneFolloweeIds } },
      select: playerSelect,
    });
    const playerMap = new Map(milestonePlayers.map((p) => [p.userId, p]));

    const result: any[] = [];
    for (const followeeId of milestoneFolloweeIds) {
      const player = playerMap.get(followeeId);
      const data = milestoneData.get(followeeId)!;
      if (player) {
        const latestSession = data.sessions[0];
        result.push({
          id: `streak_${followeeId}_${data.streak}`,
          type: "streak_milestone",
          player: toPlayerPayload(player),
          isFollowing: true,
          timestamp: `${latestSession?.session.scrapedDate}T${latestSession?.session.startTime}:00+07:00`,
          streakCount: data.streak,
          weeklyPlayed: data.weeklyPlayed.reverse(),
        });
      }
    }
    return result;
  }

  async function computeDuprHistory() {
    const duprCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const allDuprHistory = await prisma.playerDuprHistory.findMany({
      where: {
        playerId: { in: followeeIds },
        recordedAt: { gte: duprCutoff },
      },
      orderBy: { recordedAt: "desc" },
      include: { player: { select: playerSelect } },
    });

    const duprByPlayer = new Map<bigint, typeof allDuprHistory>();
    for (const row of allDuprHistory) {
      const list = duprByPlayer.get(row.playerId) ?? [];
      if (list.length < 2) {
        list.push(row);
        duprByPlayer.set(row.playerId, list);
      }
    }

    const result: any[] = [];
    for (const [followeeId, history] of duprByPlayer) {
      if (history.length < 2) continue;
      const latest = history[0];
      const previous = history[1];
      if (!latest.duprDoubles || !previous.duprDoubles) continue;
      const newVal = Number(latest.duprDoubles);
      const oldVal = Number(previous.duprDoubles);
      if (newVal <= oldVal) continue;
      result.push({
        id: `dupr_update_${followeeId}_${latest.id}`,
        type: "dupr_update",
        player: toPlayerPayload(latest.player),
        isFollowing: true,
        timestamp: latest.recordedAt.toISOString(),
        duprOld: oldVal,
        duprNew: newVal,
      });
    }
    return result;
  }

  const [streakItems, duprItems, kudosResultInner] = await Promise.all([
    computeStreaks(),
    computeDuprHistory(),
    // Kudos for live items — items are fully built at this point (joining, played, you_are_playing)
    items.length > 0
      ? prisma.kudos.groupBy({
          by: ["feedItemId", "type"],
          where: { feedItemId: { in: items.map((i) => i.id) } },
          _count: { type: true },
        })
      : Promise.resolve([]),
  ]);
  kudosResult = kudosResultInner;

  items.push(...streakItems, ...duprItems);

  for (const f of recentFollowing) {
    items.push({
      id: `just_followed_${f.followeeId}`,
      type: "just_followed",
      player: toPlayerPayload(f.followee),
      isFollowing: true,
      timestamp: f.createdAt.toISOString(),
    });
  }

  for (const f of recentFollowers) {
    const p = (f as any).follower?.reclubPlayer;
    if (!p) continue;
    items.push({
      id: `new_follower_${(f as any).follower.id}`,
      type: "new_follower",
      player: toPlayerPayload(p),
      isFollowing: false,
      timestamp: f.createdAt.toISOString(),
    });
  }

  // Strict chronological: newest timestamp first.
  items.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

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

  liveItems = filtered.slice(0, 20);

  // Persist live items so they survive future unfollows — fire and forget, don't block the response
  if (liveItems.length > 0) {
    void Promise.all(
      liveItems.map((item) =>
        prisma.feedItem.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            profileId: user.profileId,
            type: item.type,
            playerUserId: item.player?.userId ?? null,
            payload: item,
            timestamp: new Date(item.timestamp),
          },
          update: {
            payload: item,
            timestamp: new Date(item.timestamp),
          },
        })
      )
    ).catch((err) => console.error("[feed] upsert error:", err));
  }
  } // end if (!isPaginating)

  // Merge live items with historical persisted items (items no longer in live query)
  const liveItemIds = new Set(liveItems.map((i) => i.id));
  const historicalItems = persistedItems
    .filter((i) => !liveItemIds.has(i.id))
    .map((i) => i.payload as any);

  const mergedItems = [...liveItems, ...historicalItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const finalItems = isPaginating ? mergedItems.slice(0, 30) : mergedItems.slice(0, 200);
  const hasMore = persistedItems.length === 30;

  // kudosCounts was fetched in parallel with streaks+dupr above (live items only).
  // myKudos requires finalItems (includes historical persisted items) so is fetched here.
  const feedItemIds = finalItems.map((i) => i.id);
  const [kudosCounts, myKudos] = await Promise.all([
    // For paginating requests, kudosResult is empty — fetch counts fresh for the full finalItems set.
    // For live (non-paginating) requests, kudosResult already covers the live items; extend to historicals.
    isPaginating
      ? prisma.kudos.groupBy({
          by: ["feedItemId", "type"],
          where: { feedItemId: { in: feedItemIds } },
          _count: { type: true },
        })
      : Promise.resolve(kudosResult),
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
    hasMore,
  });
}
