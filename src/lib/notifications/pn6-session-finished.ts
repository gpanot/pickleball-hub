import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { reclubAvatarUrl } from "@/lib/utils";
import {
  isPnScheduleHour,
  isSessionEndedInWindow,
  sessionEndTimestamp,
  vietnamNow,
  vietnamTimeStr,
  vietnamTodayStr,
} from "@/lib/notifications/session-time";
import {
  STREAK_MILESTONES,
  PAIR_MILESTONES,
  getLifetimeSessionCount,
  computePlayerStreak,
  getSessionMilestoneReached,
  sessionMilestoneKey,
  streakMilestoneKey,
  pairFirstKey,
  pairMilestoneKey,
  venueRegularKey,
  EARLY_ADOPTER_KEY,
  setMilestoneFlag,
} from "@/lib/feed-milestones";

const PN6_TYPE = "pn6";
const PN6_THROTTLE_MAX = 2;
const PN6_THROTTLE_WINDOW_MS = 4 * 60 * 60 * 1000; // 2 PN6 per 4 h rolling window
const END_WINDOW_MINUTES = 70;

function pn6DedupType(sessionId: number, followeeUserId: bigint): string {
  return `${PN6_TYPE}:${sessionId}:${followeeUserId}`;
}

/**
 * PN6: Notify followers when someone they follow has finished a session.
 * Also creates played_self / played_today feed items.
 *
 * Push dedup: one per follower per followee session (notifications_sent).
 * Throttle: max 2 PN6 pushes per recipient per 4 h (any followee).
 */
export async function sendSessionFinishedKudosNotifications(): Promise<{
  sent: number;
  skipped: number;
  sessions: number;
  feedItemsCreated: number;
}> {
  if (!isPnScheduleHour()) {
    return { sent: 0, skipped: 0, sessions: 0, feedItemsCreated: 0 };
  }

  const vnNow = vietnamNow();
  const todayStr = vietnamTodayStr(vnNow);
  const nowTimeVN = vietnamTimeStr(vnNow);
  const windowStart = new Date(vnNow.getTime() - END_WINDOW_MINUTES * 60 * 1000);
  const windowStartTime = windowStart.toISOString().slice(11, 16);

  const finishedRosters = await prisma.sessionRoster.findMany({
    where: {
      session: {
        scrapedDate: todayStr,
        endTime: { gt: windowStartTime, lte: nowTimeVN },
      },
    },
    select: {
      userId: true,
      session: {
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          scrapedDate: true,
          eventUrl: true,
          venueId: true,
          venue: { select: { name: true } },
          club: { select: { name: true } },
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
    distinct: ["userId", "sessionId"],
  });

  let sent = 0;
  let skipped = 0;
  let feedItemsCreated = 0;
  const processedSessionIds = new Set<number>();

  for (const roster of finishedRosters) {
    const playerId = roster.userId;
    const session = roster.session;
    const venueName = session.venue?.name ?? session.club?.name ?? "their session";
    const sessionTimestamp = sessionEndTimestamp(
      session.scrapedDate,
      session.endTime,
    );

    if (
      !isSessionEndedInWindow(session.endTime, windowStartTime, nowTimeVN)
    ) {
      continue;
    }

    const player = await prisma.player.findUnique({
      where: { userId: playerId },
      select: {
        userId: true,
        displayName: true,
        imageUrl: true,
        duprDoubles: true,
      },
    });
    if (!player) continue;

    const playerName = player.displayName ?? "Someone in your circle";
    const playerImageUrl = player.imageUrl ?? reclubAvatarUrl(player.userId);

    const playerProfile = await prisma.playerProfile.findUnique({
      where: { reclubUserId: playerId },
      select: { id: true, preferences: true },
    });

    if (playerProfile) {
      const selfItemId = `played_self_${playerId}_${session.id}`;
      await prisma.feedItem.upsert({
        where: { id: selfItemId },
        create: {
          id: selfItemId,
          profileId: playerProfile.id,
          type: "played_self",
          playerUserId: playerId.toString(),
          payload: {
            id: selfItemId,
            type: "played_self",
            player: {
              userId: playerId.toString(),
              displayName: player.displayName,
              imageUrl: playerImageUrl,
              duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
            },
            venueName,
            sessionId: session.id,
            sessionTime: `${session.scrapedDate}T${session.startTime}:00+07:00`,
            timestamp: sessionTimestamp,
            isFollowing: false,
            kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
          },
          timestamp: new Date(sessionTimestamp),
        },
        update: {},
      });
      feedItemsCreated++;
    }

    // ── Milestone detection for this player ─────────────────────────────────
    // Compute lifetime session count and streak. Use prefs flags for player-level
    // dedup (NotificationSent requires a recipientId so can't be used here).
    let activeMilestone: { type: "session_count" | "streak"; n: number; weeklyPlayed?: boolean[] } | null = null;

    try {
      const prefs = (playerProfile?.preferences ?? {}) as Record<string, unknown>;

      const lifetimeCount = await getLifetimeSessionCount(playerId);
      const sessionMilestone = getSessionMilestoneReached(lifetimeCount);
      if (sessionMilestone !== null) {
        const flagKey = sessionMilestoneKey(sessionMilestone);
        if (!prefs[flagKey]) {
          activeMilestone = { type: "session_count", n: sessionMilestone };
          void setMilestoneFlag(playerId, flagKey);
        }
      }

      if (!activeMilestone) {
        // Only check streak if session count milestone didn't take priority.
        const { streak, weeklyPlayed } = await computePlayerStreak(playerId, todayStr);
        if ((STREAK_MILESTONES as readonly number[]).includes(streak)) {
          const flagKey = streakMilestoneKey(streak);
          if (!prefs[flagKey]) {
            activeMilestone = { type: "streak", n: streak, weeklyPlayed };
            void setMilestoneFlag(playerId, flagKey);
          }
        }
      }
    } catch (err) {
      console.error(`[PN6] milestone detection failed for player ${playerId}:`, err);
    }

    // ── venue_regular detection ──────────────────────────────────────────────
    try {
      const prefs = (playerProfile?.preferences ?? {}) as Record<string, unknown>;
      const venueId = session.venueId ?? null;
      if (venueId) {
        const sessionAtVenue = await prisma.sessionRoster.count({
          where: {
            userId: playerId,
            isConfirmed: true,
            session: { venueId },
          },
        });
        if (sessionAtVenue === 10) {
          const key = venueRegularKey(venueId);
          if (!prefs[key]) {
            void setMilestoneFlag(playerId, key);
            // Fan out venue_regular feed items to followers
            const venueRegularFollowers = await prisma.follow.findMany({
              where: { followeeId: playerId },
              select: { follower: { select: { id: true } } },
            });
            const vName = session.venue?.name ?? "their venue";
            for (const { follower } of venueRegularFollowers) {
              const vrItemId = `venue_regular_${playerId}_${venueId}_${follower.id}`;
              await prisma.feedItem.upsert({
                where: { id: vrItemId },
                create: {
                  id: vrItemId,
                  profileId: follower.id,
                  type: "venue_regular",
                  playerUserId: playerId.toString(),
                  payload: {
                    id: vrItemId,
                    type: "venue_regular",
                    player: {
                      userId: playerId.toString(),
                      displayName: player.displayName,
                      imageUrl: playerImageUrl,
                      duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
                    },
                    venueName: vName,
                    venueSessionCount: 10,
                    timestamp: sessionTimestamp,
                    isFollowing: true,
                    kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
                  },
                  timestamp: new Date(sessionTimestamp),
                },
                update: {},
              });
              feedItemsCreated++;
            }
          }
        }
      }
    } catch (err) {
      console.error(`[PN6] venue_regular detection failed for player ${playerId}:`, err);
    }

    // ── early_adopter detection ──────────────────────────────────────────────
    try {
      const prefs = (playerProfile?.preferences ?? {}) as Record<string, unknown>;
      if (!prefs[EARLY_ADOPTER_KEY]) {
        const rank = await prisma.player.count({
          where: { userId: { lte: playerId } },
        });
        if (rank <= 1000) {
          void setMilestoneFlag(playerId, EARLY_ADOPTER_KEY);
          const eaFollowers = await prisma.follow.findMany({
            where: { followeeId: playerId },
            select: { follower: { select: { id: true } } },
          });
          for (const { follower } of eaFollowers) {
            const eaItemId = `early_adopter_${playerId}_${follower.id}`;
            await prisma.feedItem.upsert({
              where: { id: eaItemId },
              create: {
                id: eaItemId,
                profileId: follower.id,
                type: "early_adopter",
                playerUserId: playerId.toString(),
                payload: {
                  id: eaItemId,
                  type: "early_adopter",
                  player: {
                    userId: playerId.toString(),
                    displayName: player.displayName,
                    imageUrl: playerImageUrl,
                    duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
                  },
                  timestamp: sessionTimestamp,
                  isFollowing: true,
                  kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
                },
                timestamp: new Date(sessionTimestamp),
              },
              update: {},
            });
            feedItemsCreated++;
          }
        }
      }
    } catch (err) {
      console.error(`[PN6] early_adopter detection failed for player ${playerId}:`, err);
    }

    const followers = await prisma.follow.findMany({
      where: { followeeId: playerId },
      select: {
        follower: {
          select: { id: true, pushToken: true, pushTokenIos: true },
        },
      },
    });

    if (followers.length > 0) {
      console.log(
        `[PN6] player=${playerName} (${playerId}) session=${session.id} followers=${followers.length} milestone=${activeMilestone?.type ?? "none"}`,
      );
    }

    for (const { follower } of followers) {
      const todayItemId = `played_today_${playerId}_${session.id}_${follower.id}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todayPayload: any = {
        id: todayItemId,
        type: "played_today",
        player: {
          userId: playerId.toString(),
          displayName: player.displayName,
          imageUrl: playerImageUrl,
          duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
        },
        venueName,
        sessionId: session.id,
        timestamp: sessionTimestamp,
        isFollowing: true,
        kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
      };

      // Annotate feed item with milestone kind so it renders the gold card.
      if (activeMilestone?.type === "session_count") {
        todayPayload.milestoneKind = "session_count";
        todayPayload.sessionMilestone = activeMilestone.n;
      }

      await prisma.feedItem.upsert({
        where: { id: todayItemId },
        create: {
          id: todayItemId,
          profileId: follower.id,
          type: "played_today",
          playerUserId: playerId.toString(),
          payload: todayPayload,
          timestamp: new Date(sessionTimestamp),
        },
        update: {},
      });
      feedItemsCreated++;

      if (!follower.pushToken && !follower.pushTokenIos) {
        skipped++;
        continue;
      }

      // Milestone push (highest priority) replaces the standard PN6 push for this session.
      if (activeMilestone) {
        let title: string;
        let body: string;
        if (activeMilestone.type === "session_count") {
          const suffix = activeMilestone.n === 1 ? "st" : activeMilestone.n === 2 ? "nd" : activeMilestone.n === 3 ? "rd" : "th";
          title = `${playerName} just completed their ${activeMilestone.n}${suffix} session 🎉`;
          body = `Celebrate this milestone with them!`;
        } else {
          title = `${playerName} just reached a ${activeMilestone.n}-week streak 🔥`;
          body = `They've been playing every week. Cheer them on!`;
        }

        const milestoneDedup = `pn6_milestone:${session.id}:${playerId}:${follower.id}`;
        const alreadySentToFollower = await prisma.notificationSent.findFirst({
          where: { recipientId: follower.id, type: milestoneDedup },
          select: { id: true },
        });
        if (!alreadySentToFollower) {
          const mResult = await sendPushNotification(follower.id, {
            title,
            body,
            data: {
              type: PN6_TYPE,
              screen: "Circle",
              followeeUserId: playerId.toString(),
              sessionId: session.id.toString(),
            },
          });
          if (mResult.success) {
            await prisma.notificationSent.create({
              data: { recipientId: follower.id, type: milestoneDedup },
            });
            sent++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
        continue; // Skip standard PN6 push for this follower.
      }

      // Standard PN6 push.
      const alreadySentForSession = await prisma.notificationSent.findFirst({
        where: {
          recipientId: follower.id,
          type: pn6DedupType(session.id, playerId),
        },
        select: { id: true },
      });
      if (alreadySentForSession) {
        skipped++;
        continue;
      }

      const sentInWindow = await prisma.notificationSent.count({
        where: {
          recipientId: follower.id,
          type: { startsWith: `${PN6_TYPE}:` },
          sentAt: { gte: new Date(Date.now() - PN6_THROTTLE_WINDOW_MS) },
        },
      });
      if (sentInWindow >= PN6_THROTTLE_MAX) {
        skipped++;
        continue;
      }

      const result = await sendPushNotification(follower.id, {
        title: `${playerName} just finished playing 🏓`,
        body: `Give them a fist bump for their session at ${venueName}`,
        data: {
          type: PN6_TYPE,
          screen: "Circle",
          followeeUserId: playerId.toString(),
          sessionId: session.id.toString(),
        },
      });

      if (result.success) {
        await prisma.notificationSent.create({
          data: {
            recipientId: follower.id,
            type: pn6DedupType(session.id, playerId),
          },
        });
        sent++;
      } else {
        skipped++;
      }
    }
    // ── pair milestone detection (once per session) ──────────────────────────
    if (!processedSessionIds.has(session.id)) {
      processedSessionIds.add(session.id);
      const pairCounter = { count: 0 };
      await detectPairMilestones(session.id, sessionTimestamp, pairCounter).catch((err) => {
        console.error(`[PN6] pair milestone detection failed for session ${session.id}:`, err);
      });
      feedItemsCreated += pairCounter.count;
    }
  }

  return {
    sent,
    skipped,
    sessions: finishedRosters.length,
    feedItemsCreated,
  };
}

/**
 * Detect play_pair_first and play_pair_milestone for all pairs in a session
 * and fan out feed items to both players' followers.
 */
async function detectPairMilestones(
  sessionId: number,
  sessionTimestamp: string,
  feedItemsCreated: { count: number }
): Promise<void> {
  const rosterPlayers = await prisma.sessionRoster.findMany({
    where: { sessionId, isConfirmed: true },
    select: {
      userId: true,
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
          _count: { select: { followers: true } },
        },
      },
    },
  });

  if (rosterPlayers.length < 2) return;

  for (let i = 0; i < rosterPlayers.length; i++) {
    for (let j = i + 1; j < rosterPlayers.length; j++) {
      const playerA = rosterPlayers[i];
      const playerB = rosterPlayers[j];
      if (!playerA.player || !playerB.player) continue;

      // Count co-sessions (excluding the current one)
      const coCount = await prisma.sessionRoster.count({
        where: {
          userId: playerA.userId,
          isConfirmed: true,
          sessionId: { not: sessionId },
          session: {
            rosters: { some: { userId: playerB.userId, isConfirmed: true } },
          },
        },
      });

      // Determine which player is the "subject" (more followers; lower userId as tiebreak)
      const aFollowers = playerA.player._count.followers;
      const bFollowers = playerB.player._count.followers;
      const subject =
        aFollowers > bFollowers ? playerA
        : bFollowers > aFollowers ? playerB
        : (playerA.userId < playerB.userId ? playerA : playerB);
      const other = subject === playerA ? playerB : playerA;

      const subjectPrefs = await prisma.playerProfile.findUnique({
        where: { reclubUserId: subject.userId },
        select: { preferences: true },
      });
      const prefs = (subjectPrefs?.preferences ?? {}) as Record<string, unknown>;

      if (coCount === 0) {
        // First time playing together
        const key = pairFirstKey(other.userId.toString());
        if (!prefs[key]) {
          void setMilestoneFlag(subject.userId, key);
          // Fan out to followers of BOTH players
          const allFollowerIds = await getPairFollowerIds([subject.userId, other.userId]);
          for (const profileId of allFollowerIds) {
            const itemId = `play_pair_first_${subject.userId}_${other.userId}_${profileId}`;
            await prisma.feedItem.upsert({
              where: { id: itemId },
              create: {
                id: itemId,
                profileId,
                type: "play_pair_first",
                playerUserId: subject.userId.toString(),
                payload: {
                  id: itemId,
                  type: "play_pair_first",
                  player: {
                    userId: subject.userId.toString(),
                    displayName: subject.player!.displayName,
                    imageUrl: subject.player!.imageUrl ?? reclubAvatarUrl(subject.userId),
                    duprDoubles: subject.player!.duprDoubles ? Number(subject.player!.duprDoubles) : null,
                  },
                  relatedPlayer: {
                    userId: other.userId.toString(),
                    displayName: other.player!.displayName ?? "",
                    imageUrl: other.player!.imageUrl ?? reclubAvatarUrl(other.userId),
                  },
                  timestamp: sessionTimestamp,
                  isFollowing: true,
                  kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
                },
                timestamp: new Date(sessionTimestamp),
              },
              update: {},
            }).catch(() => {});
            feedItemsCreated.count++;
          }
        }
      } else if ((PAIR_MILESTONES as readonly number[]).includes(coCount + 1)) {
        // Pair milestone (10th, 25th, or 50th game)
        const n = coCount + 1;
        const key = pairMilestoneKey(n, other.userId.toString());
        if (!prefs[key]) {
          void setMilestoneFlag(subject.userId, key);
          const allFollowerIds = await getPairFollowerIds([subject.userId, other.userId]);
          for (const profileId of allFollowerIds) {
            const itemId = `play_pair_milestone_${subject.userId}_${other.userId}_${n}_${profileId}`;
            await prisma.feedItem.upsert({
              where: { id: itemId },
              create: {
                id: itemId,
                profileId,
                type: "play_pair_milestone",
                playerUserId: subject.userId.toString(),
                payload: {
                  id: itemId,
                  type: "play_pair_milestone",
                  player: {
                    userId: subject.userId.toString(),
                    displayName: subject.player!.displayName,
                    imageUrl: subject.player!.imageUrl ?? reclubAvatarUrl(subject.userId),
                    duprDoubles: subject.player!.duprDoubles ? Number(subject.player!.duprDoubles) : null,
                  },
                  relatedPlayer: {
                    userId: other.userId.toString(),
                    displayName: other.player!.displayName ?? "",
                    imageUrl: other.player!.imageUrl ?? reclubAvatarUrl(other.userId),
                  },
                  pairSessionCount: n,
                  timestamp: sessionTimestamp,
                  isFollowing: true,
                  kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
                },
                timestamp: new Date(sessionTimestamp),
              },
              update: {},
            }).catch(() => {});
            feedItemsCreated.count++;
          }
        }
      }
    }
  }
}

async function getPairFollowerIds(userIds: bigint[]): Promise<string[]> {
  const follows = await prisma.follow.findMany({
    where: { followeeId: { in: userIds } },
    select: { followerId: true },
  });
  const seen = new Set<string>();
  for (const f of follows) seen.add(f.followerId);
  return Array.from(seen);
}
