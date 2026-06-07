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
      select: { id: true },
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
        `[PN6] player=${playerName} (${playerId}) session=${session.id} followers=${followers.length}`,
      );
    }

    for (const { follower } of followers) {
      const todayItemId = `played_today_${playerId}_${session.id}_${follower.id}`;
      await prisma.feedItem.upsert({
        where: { id: todayItemId },
        create: {
          id: todayItemId,
          profileId: follower.id,
          type: "played_today",
          playerUserId: playerId.toString(),
          payload: {
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
          },
          timestamp: new Date(sessionTimestamp),
        },
        update: {},
      });
      feedItemsCreated++;

      if (!follower.pushToken && !follower.pushTokenIos) {
        skipped++;
        continue;
      }

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
  }

  return {
    sent,
    skipped,
    sessions: finishedRosters.length,
    feedItemsCreated,
  };
}
