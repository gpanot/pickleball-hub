import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

/**
 * PN6: Notify followers when a player they follow has just finished a session.
 * Prompt them to give kudos while the session is fresh.
 *
 * Trigger: cron every 1 h (7am–9pm ICT) via GET /api/cron/session-finished-kudos.
 * Throttle: max 2 PN6 per recipient per 24 h.
 * Window: sessions whose endTime crossed in the last 65 min (cron window + 5 min buffer).
 */
export async function sendSessionFinishedKudosNotifications(): Promise<{
  sent: number;
  skipped: number;
  sessions: number;
}> {
  const now = new Date();
  const hourICT = ((now.getUTCHours() + 7) % 24);
  if (hourICT < 7 || hourICT >= 21) {
    return { sent: 0, skipped: 0, sessions: 0 };
  }

  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = vnNow.toISOString().slice(0, 10);
  const nowTimeVN = vnNow.toISOString().slice(11, 16);

  const windowMins = 65;
  const windowStart = new Date(vnNow.getTime() - windowMins * 60 * 1000);
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
          endTime: true,
          venue: { select: { name: true } },
        },
      },
    },
    distinct: ["userId", "sessionId"],
  });

  let sent = 0;
  let skipped = 0;

  for (const roster of finishedRosters) {
    const playerId = roster.userId;
    const session = roster.session;

    const player = await prisma.player.findUnique({
      where: { userId: playerId },
      select: { userId: true, displayName: true },
    });
    const playerName = player?.displayName || "Someone in your circle";

    const followers = await prisma.follow.findMany({
      where: { followeeId: playerId },
      select: {
        follower: {
          select: { id: true, pushToken: true, pushTokenIos: true },
        },
      },
    });

    for (const { follower } of followers) {
      if (!follower.pushToken && !follower.pushTokenIos) {
        skipped++;
        continue;
      }

      const alreadySentToday = await prisma.notificationSent.count({
        where: {
          recipientId: follower.id,
          type: "pn6",
          sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (alreadySentToday >= 2) {
        skipped++;
        continue;
      }

      const venueName = session.venue?.name ?? "their session";
      const result = await sendPushNotification(follower.id, {
        title: `${playerName} just finished playing 🏓`,
        body: `Give them a fist bump for their session at ${venueName}`,
        data: {
          type: "pn6",
          screen: "Circle",
          followeeUserId: playerId.toString(),
          sessionId: session.id.toString(),
        },
      });

      if (result.success) {
        await prisma.notificationSent.create({
          data: {
            recipientId: follower.id,
            type: "pn6",
          },
        });
        sent++;
      } else {
        skipped++;
      }
    }
  }

  return { sent, skipped, sessions: finishedRosters.length };
}
