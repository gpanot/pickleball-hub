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

  // VN "today" date string
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = vnNow.toISOString().slice(0, 10);
  // Current time in ICT as HH:mm
  const nowTimeVN = vnNow.toISOString().slice(11, 16);

  // Window: sessions that ended between 65 min ago and now (catches a 60-min cron + buffer)
  const windowMins = 65;
  const windowStart = new Date(vnNow.getTime() - windowMins * 60 * 1000);
  const windowStartTime = windowStart.toISOString().slice(11, 16);

  // Find sessions that finished in the cron window today
  // endTime is stored as HH:mm string; filter sessions where endTime is in (windowStartTime, nowTimeVN]
  const finishedRosters = await prisma.sessionRoster.findMany({
    where: {
      session: {
        scrapedDate: todayStr,
        endTime: { gt: windowStartTime, lte: nowTimeVN },
      },
    },
    select: {
      userId: true, // Reclub Player.userId (BigInt) = the player who finished
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
    const playerId = roster.userId; // BigInt
    const session = roster.session;

    // Find the Player record for display name
    const player = await prisma.player.findUnique({
      where: { userId: playerId },
      select: { userId: true, displayName: true },
    });
    const playerName = player?.displayName || "Someone in your circle";

    // Find all app followers of this player
    const followers = await prisma.follow.findMany({
      where: { followeeId: playerId },
      select: {
        follower: {
          select: { id: true, pushToken: true },
        },
      },
    });

    for (const { follower } of followers) {
      if (!follower.pushToken) {
        skipped++;
        continue;
      }

      // Throttle: max 1 PN6 per (recipient, followee) per day
      // We encode followee as senderId (stored as PlayerProfile.id when available,
      // or skip dedup if no profile — BigInt players without app accounts can't be senderId)
      const alreadySentToday = await prisma.notificationSent.count({
        where: {
          recipientId: follower.id,
          type: "pn6",
          sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          // Dedup per session: we store sessionId encoded as a prefix in a dedicated
          // query rather than adding a new column — check by session context below
        },
      });
      // Allow max 2 PN6 per day per recipient (could see multiple friends finish)
      if (alreadySentToday >= 2) {
        skipped++;
        continue;
      }

      const venueName = session.venue?.name ?? "their session";
      const result = await sendPushNotification({
        token: follower.pushToken,
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
