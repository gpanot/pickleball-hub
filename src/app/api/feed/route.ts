import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import {
  isSessionLive,
  sessionEndTimestamp,
  sessionStartTimestamp,
  vietnamNow,
  vietnamTodayStr,
  vietnamTimeStr,
} from "@/lib/notifications/session-time";
import { reclubAvatarUrl } from "@/lib/utils";
import {
  STREAK_MILESTONES,
  getWeekKey,
  getDuprThresholdCrossed,
  getSessionMilestoneReached,
  getBatchLifetimeSessionCounts,
  getBatchPlayerPrefs,
  setMilestoneFlag,
  duprMilestoneKey,
  sessionMilestoneKey,
} from "@/lib/feed-milestones";

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

  const [follows, blockingRaw, blockedByRaw] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: user.profileId },
      select: { followeeId: true },
    }),
    prisma.block.findMany({
      where: { blockerId: user.profileId },
      select: { blocked: { select: { reclubUserId: true } } },
    }),
    user.reclubUserId
      ? prisma.block.findMany({
          where: { blockedId: user.profileId },
          select: { blocker: { select: { reclubUserId: true } } },
        })
      : Promise.resolve([]),
  ]);

  if (follows.length === 0) {
    return NextResponse.json({ items: [], hasFollows: false, hasMore: false });
  }

  const blockedReclubIds = new Set<string>([
    ...blockingRaw.flatMap((b) => (b.blocked.reclubUserId ? [b.blocked.reclubUserId.toString()] : [])),
    ...(blockedByRaw as Array<{ blocker: { reclubUserId: bigint | null } }>).flatMap((b) =>
      b.blocker.reclubUserId ? [b.blocker.reclubUserId.toString()] : [],
    ),
  ]);

  const followeeIds = follows
    .map((f) => f.followeeId)
    .filter((id) => !blockedReclubIds.has(id.toString()));
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
  const vnNow = vietnamNow();
  const todayStr = vietnamTodayStr(vnNow);
  const nowTimeVN = vietnamTimeStr(vnNow);

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const cutoffStr = fiveDaysAgo.toISOString().slice(0, 10);

  const playerSelect = {
    userId: true,
    displayName: true,
    imageUrl: true,
    duprDoubles: true,
  } as const;

  // Fire all queries in parallel — roster queries, follow events, persisted feed, and live roster
  const [upcomingRosters, recentRosters, todayCompletedRosters, recentFollowing, recentFollowers, myLiveRosterRows] =
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
              endTime: true,
              scrapedDate: true,
              club: { select: { name: true } },
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
        ? prisma.sessionRoster.findMany({
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
                },
              },
            },
            orderBy: { session: { startTime: "desc" } },
          })
        : Promise.resolve([]),
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
  // Batch lifetime session counts for all unique players in today's rosters
  // so we can detect session count milestones in a single extra query.
  const todayPlayerIds = [...new Set(todayCompletedRosters.map((r) => r.userId))];
  const lifetimeCountMap = await getBatchLifetimeSessionCounts(todayPlayerIds);

  // Fetch prefs for players who are AT a session milestone count.
  const sessionMilestoneCandidates = todayPlayerIds.filter((id) => {
    const count = lifetimeCountMap.get(id.toString()) ?? 0;
    return getSessionMilestoneReached(count) !== null;
  });
  const sessionMilestonePrefsMap = await getBatchPlayerPrefs(sessionMilestoneCandidates);

  // Batch-fetch the most-recent prior session date per player for comeback detection.
  // Uses distinct so we get exactly one row per player (most recent, desc order).
  const todayDateObj = new Date(`${todayStr}T00:00:00+07:00`);
  const lastSessionByPlayer = new Map<string, string>(); // userId → scrapedDate
  if (todayPlayerIds.length > 0) {
    const mostRecentPrior = await prisma.sessionRoster.findMany({
      where: {
        userId: { in: todayPlayerIds },
        session: { scrapedDate: { lt: todayStr } },
      },
      select: {
        userId: true,
        session: { select: { scrapedDate: true } },
      },
      orderBy: { session: { scrapedDate: "desc" } },
      distinct: ["userId"],
    });
    for (const r of mostRecentPrior) {
      lastSessionByPlayer.set(r.userId.toString(), r.session.scrapedDate);
    }
  }

  // Track which followee user IDs have a played_today — used to gate streak emission.
  const todayPlayedFolloweeIds = new Set<bigint>();

  const seenTodayKeys = new Set<string>();
  for (const r of todayCompletedRosters) {
    const key = `${r.userId}_${r.sessionId}`;
    if (seenTodayKeys.has(key)) continue;
    seenTodayKeys.add(key);

    todayPlayedFolloweeIds.add(r.userId);

    const lifetimeCount = lifetimeCountMap.get(r.userId.toString()) ?? 0;
    const sessionMilestone = getSessionMilestoneReached(lifetimeCount);

    // Priority 1 — session count milestone
    let milestoneKind: string | undefined;
    let sessionMilestoneN: number | undefined;
    if (sessionMilestone !== null) {
      const prefs = sessionMilestonePrefsMap.get(r.userId.toString()) ?? {};
      const flagKey = sessionMilestoneKey(sessionMilestone);
      if (!prefs[flagKey]) {
        milestoneKind = "session_count";
        sessionMilestoneN = sessionMilestone;
        void setMilestoneFlag(r.userId, flagKey);
      }
    }

    // Priority 3/4 — comeback / first_venue (only if no higher-priority milestone)
    let itemType: string = "played_today";
    let daysSince: number | undefined;
    let clubName: string | undefined;

    if (!milestoneKind) {
      const uid = r.userId.toString();
      const lastDateStr = lastSessionByPlayer.get(uid); // most recent prior session

      if (lastDateStr) {
        const lastDate = new Date(`${lastDateStr}T00:00:00+07:00`);
        const diffMs = todayDateObj.getTime() - lastDate.getTime();
        const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

        if (diffDays >= 14) {
          itemType = "comeback";
          daysSince = diffDays;
          clubName = r.session.club.name;
        }
        // first_venue check deferred to after the loop (needs a DB count per player+club pair).
        // We set a sentinel so the post-loop batch can pick it up.
      }
      // If no prior session at all → plain played_today (new player; no venue context yet)
    }

    // Use the same played_today ID regardless of derived type so PN6-persisted
    // items are updated via upsert rather than creating a duplicate.
    items.push({
      id: `played_today_${r.userId}_${r.sessionId}_${user.profileId}`,
      type: itemType,
      player: toPlayerPayload(r.player),
      isFollowing: true,
      timestamp: sessionEndTimestamp(r.session.scrapedDate, r.session.endTime),
      venueName: r.session.club.name,
      sessionId: r.session.id,
      ...(milestoneKind ? { milestoneKind, sessionMilestone: sessionMilestoneN } : {}),
      ...(daysSince !== undefined ? { daysSince } : {}),
      ...(clubName !== undefined ? { clubName } : {}),
    });
  }

  // ── first_venue post-loop check ───────────────────────────────────────────
  // For plain played_today items (no milestone, no comeback), check whether
  // the player has ever played at today's club before. If not → first_venue.
  // Only applies when the player has at least one prior session (lifetimeCount > 1).
  const firstVenueCandidates = items.filter(
    (i) =>
      i.type === "played_today" &&
      !i.milestoneKind &&
      i.sessionId != null &&
      i.venueName
  );

  if (firstVenueCandidates.length > 0) {
    await Promise.all(
      firstVenueCandidates.map(async (item) => {
        const playerUserId = BigInt(item.player.userId);
        const lifetimeCount = lifetimeCountMap.get(item.player.userId) ?? 0;
        // Only promote if player has played before (skip truly new players)
        if (lifetimeCount <= 1) return;
        const clubNameNorm = item.venueName.trim().toLowerCase();
        const priorAtClub = await prisma.sessionRoster.findFirst({
          where: {
            userId: playerUserId,
            session: {
              scrapedDate: { lt: todayStr },
              club: { name: { equals: clubNameNorm, mode: "insensitive" } },
            },
          },
          select: { sessionId: true },
        });
        if (!priorAtClub) {
          item.type = "first_venue";
          item.clubName = item.venueName;
        }
      })
    );
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
        lastSeen: sessionEndTimestamp(
          r.session.scrapedDate,
          r.session.endTime ?? r.session.startTime,
        ),
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
  // Pick the latest session that is actually live (not merely the latest started).
  const myLiveRoster = (myLiveRosterRows as Array<{
    sessionId: number;
    session: {
      id: number;
      name: string;
      eventUrl: string;
      startTime: string;
      endTime: string;
      durationMin: number;
      club: { name: string };
    };
  }>).find((r) =>
    isSessionLive(
      r.session.startTime,
      r.session.endTime,
      r.session.durationMin,
      nowTimeVN,
    ),
  );

  if (myLiveRoster) {
    const sess = myLiveRoster.session;
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
        timestamp: sessionStartTimestamp(todayStr, sess.startTime),
        sessionId: sess.id,
        sessionName: sess.name,
        venueName: sess.club.name,
        eventUrl: sess.eventUrl,
      });
    }
  }

  // ── played_self: viewer's own sessions (last 5 days + today ended) ────────────
  // Catches sessions the PN6 cron missed and any day the cron didn't run.
  // Excluded from the per-player cap (like played_today / you_are_playing).
  if (user.reclubUserId) {
    const pastSelfRosters = await prisma.sessionRoster.findMany({
      where: {
        userId: user.reclubUserId,
        session: {
          OR: [
            { scrapedDate: { gte: cutoffStr, lt: todayStr } },
            { scrapedDate: todayStr, endTime: { lte: nowTimeVN } },
          ],
        },
      },
      include: {
        session: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            scrapedDate: true,
            eventUrl: true,
            club: { select: { name: true } },
            snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { session: { scrapedDate: "desc" } },
      take: 10,
    });

    if (pastSelfRosters.length > 0) {
      const myProfile = await prisma.player.findUnique({
        where: { userId: user.reclubUserId },
        select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
      });
      if (myProfile) {
        for (const r of pastSelfRosters) {
          const selfId = `played_self_${user.reclubUserId}_${r.session.id}`;
          // Skip if there's already a you_are_playing for the same session
          if (items.some((i) => i.id === `you_are_playing_${r.session.id}`)) continue;
          items.push({
            id: selfId,
            type: "played_self",
            player: toPlayerPayload(myProfile),
            isFollowing: false,
            timestamp: sessionEndTimestamp(
              r.session.scrapedDate,
              r.session.endTime,
            ),
            venueName: r.session.club.name,
            sessionId: r.session.id,
            sessionTime: `${r.session.scrapedDate}T${r.session.startTime}:00+07:00`,
          });
        }
      }
    }
  }

  // ── Streaks, DUPR history, and follow events — run in parallel ───────────────
  // These three are completely independent: no shared mutable state, different tables.

  const now = new Date();

  // Only compute streaks for followees who also played today (per spec).
  // Capped at 10 to keep the query fast regardless of follow count.
  const streakFollowees = followeeIds
    .filter((id) => todayPlayedFolloweeIds.has(id))
    .slice(0, 10);
  const shouldComputeStreaks = streakFollowees.length > 0;

  async function computeStreaks() {
    if (!shouldComputeStreaks) return [];
    const streakCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const streakCutoffStr = streakCutoff.toISOString().slice(0, 10);

    const allStreakRosters = await prisma.sessionRoster.findMany({
      where: {
        userId: { in: streakFollowees },
        session: { scrapedDate: { gte: streakCutoffStr, lte: todayStr } },
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
      if (isCurrentWeekPlayed && (STREAK_MILESTONES as readonly number[]).includes(streak)) {
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
      if (!player) continue;
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

    // Collect players who cross a threshold so we can batch-fetch their prefs.
    type DuprCandidate = {
      followeeId: bigint;
      history: typeof allDuprHistory;
      newVal: number;
      oldVal: number;
      threshold: number;
    };
    const duprMilestoneCandidates: DuprCandidate[] = [];
    const duprStandardItems: any[] = [];

    for (const [followeeId, history] of duprByPlayer) {
      if (history.length < 2) continue;
      const latest = history[0];
      const previous = history[1];
      if (!latest.duprDoubles || !previous.duprDoubles) continue;
      const newVal = Number(latest.duprDoubles);
      const oldVal = Number(previous.duprDoubles);
      if (newVal <= oldVal) continue;

      const threshold = getDuprThresholdCrossed(oldVal, newVal);
      if (threshold !== null) {
        duprMilestoneCandidates.push({ followeeId, history, newVal, oldVal, threshold });
      } else {
        // Standard DUPR update — copy now updated per spec
        const latest2 = history[0];
        duprStandardItems.push({
          id: `dupr_update_${followeeId}_${latest2.id}`,
          type: "dupr_update",
          player: toPlayerPayload(latest2.player),
          isFollowing: true,
          timestamp: latest2.recordedAt.toISOString(),
          duprOld: oldVal,
          duprNew: newVal,
        });
      }
    }

    // Batch-fetch prefs for milestone candidates.
    const milestonePrefs = await getBatchPlayerPrefs(
      duprMilestoneCandidates.map((c) => c.followeeId)
    );

    const result: any[] = [...duprStandardItems];

    for (const c of duprMilestoneCandidates) {
      const latest = c.history[0];
      const flagKey = duprMilestoneKey(c.threshold);
      const prefs = milestonePrefs.get(c.followeeId.toString()) ?? {};

      let milestoneKind: string | undefined;
      let milestoneDupr: number | undefined;

      if (!prefs[flagKey]) {
        milestoneKind = "dupr_threshold";
        milestoneDupr = c.threshold;
        // Set flag so each threshold fires at most once per player.
        void setMilestoneFlag(c.followeeId, flagKey);
      }
      // Always emit the card (milestone or standard copy); milestone fields are optional.
      result.push({
        id: `dupr_update_${c.followeeId}_${latest.id}`,
        type: "dupr_update",
        player: toPlayerPayload(latest.player),
        isFollowing: true,
        timestamp: latest.recordedAt.toISOString(),
        duprOld: c.oldVal,
        duprNew: c.newVal,
        ...(milestoneKind ? { milestoneKind, milestoneDupr } : {}),
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

  // Priority enforcement: session_count milestone > streak_milestone for the same player+day.
  // If a played_today item has milestoneKind="session_count", drop any streak_milestone
  // for that same followee so only the highest-priority card appears.
  const sessionCountFolloweeIds = new Set(
    items
      .filter((i) => i.type === "played_today" && i.milestoneKind === "session_count")
      .map((i) => i.player.userId)
  );
  const itemsAfterPriority = items.filter(
    (i) =>
      !(i.type === "streak_milestone" && sessionCountFolloweeIds.has(i.player.userId))
  );
  items.length = 0;
  items.push(...itemsAfterPriority);

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
  const EXEMPT_TYPES = new Set(["just_followed", "new_follower", "played_today", "comeback", "first_venue", "first_host", "you_are_playing", "played_self", "gear_setup"]);
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
          },
        })
      )
    ).catch((err) => console.error("[feed] upsert error:", err));
  }
  } // end if (!isPaginating)

  // Merge live items with historical persisted items (items no longer in live query)
  const liveItemIds = new Set(liveItems.map((i) => i.id));
  const historicalItems = persistedItems
    .filter((i) => !liveItemIds.has(i.id) && i.type !== "you_are_playing")
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
