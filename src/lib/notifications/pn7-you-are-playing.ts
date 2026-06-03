import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

/**
 * PN7: Notify a user when their session has just started.
 * "You are playing, check and connect with players on the court now"
 *
 * Trigger: cron every 30 min (7am–9pm ICT) via GET /api/cron/you-are-playing.
 * Guard:
 *   - Session must have started in the last 35-minute window (cron window + 5 min buffer)
 *   - Session must not be more than 30 min old (don't notify late)
 *   - Max 1 PN7 per user per session (deduplicated by feedItemId in SentNotification table
 *     — using a DB upsert guard on pn7_{userId}_{sessionId})
 */
export async function sendYouArePlayingNotifications(): Promise<{
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

  // Window: sessions that started in the last 35 minutes
  const windowMins = 35;
  const windowStart = new Date(vnNow.getTime() - windowMins * 60 * 1000);
  const windowStartTime = windowStart.toISOString().slice(11, 16);

  // Find rosters where the session started in the last 35 minutes
  const liveRosters = await prisma.sessionRoster.findMany({
    where: {
      session: {
        scrapedDate: todayStr,
        startTime: { gt: windowStartTime, lte: nowTimeVN },
        status: "active",
      },
    },
    select: {
      userId: true,
      session: {
        select: {
          id: true,
          startTime: true,
          venue: { select: { name: true } },
          club: { select: { name: true } },
        },
      },
    },
    distinct: ["userId", "sessionId"],
  });

  let sent = 0;
  let skipped = 0;
  const sessionsSeen = new Set<number>();

  for (const roster of liveRosters) {
    const playerId = roster.userId;
    const session = roster.session;
    sessionsSeen.add(session.id);

    const venueName = session.venue?.name ?? session.club?.name ?? "your court";
    const guardId = `pn7_${playerId}_${session.id}`;

    // Find the app profile for this Reclub user
    const profile = await prisma.playerProfile.findUnique({
      where: { reclubUserId: playerId },
      select: { id: true, pushToken: true, pushTokenIos: true },
    });

    if (!profile) {
      skipped++;
      continue;
    }

    if (!profile.pushToken && !profile.pushTokenIos) {
      skipped++;
      continue;
    }

    // Deduplicate: only send once per user per session
    const alreadySent = await prisma.feedItem.findUnique({
      where: { id: guardId },
      select: { id: true },
    });

    if (alreadySent) {
      skipped++;
      continue;
    }

    // Insert guard record so we don't send twice
    await prisma.feedItem.upsert({
      where: { id: guardId },
      create: {
        id: guardId,
        profileId: profile.id,
        type: "pn7_guard",
        playerUserId: playerId.toString(),
        payload: { sessionId: session.id, sentAt: now.toISOString() },
        timestamp: now,
      },
      update: {},
    });

    const result = await sendPushNotification(profile.id, {
      title: "You are playing 🏓",
      body: "Check and connect with players on the court now",
      data: {
        type: "pn7",
        screen: "Circle",
        sessionId: String(session.id),
        venueName,
      },
    });

    if (result.success) {
      sent++;
      console.log(`[PN7] Sent to profileId=${profile.id} sessionId=${session.id} venue="${venueName}"`);
    } else {
      skipped++;
      console.warn(`[PN7] Failed for profileId=${profile.id} sessionId=${session.id} — ${result.error}`);
    }
  }

  return { sent, skipped, sessions: sessionsSeen.size };
}
