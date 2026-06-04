import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import {
  isPnScheduleHour,
  isSessionLive,
  vietnamNow,
  vietnamTimeStr,
  vietnamTodayStr,
} from "@/lib/notifications/session-time";

const PN7_TYPE = "pn7";

function pn7DedupType(sessionId: number): string {
  return `${PN7_TYPE}:${sessionId}`;
}

/**
 * PN7: Notify a user when their session is live (same window as feed "you_are_playing").
 * Dedup: one push per user per session via notifications_sent type pn7:{sessionId}.
 */
export async function sendYouArePlayingNotifications(): Promise<{
  sent: number;
  skipped: number;
  sessions: number;
}> {
  if (!isPnScheduleHour()) {
    return { sent: 0, skipped: 0, sessions: 0 };
  }

  const vnNow = vietnamNow();
  const todayStr = vietnamTodayStr(vnNow);
  const nowTimeVN = vietnamTimeStr(vnNow);

  const liveRosters = await prisma.sessionRoster.findMany({
    where: {
      session: {
        scrapedDate: todayStr,
        startTime: { lte: nowTimeVN },
      },
    },
    select: {
      userId: true,
      session: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          durationMin: true,
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
    const session = roster.session;
    if (
      !isSessionLive(
        session.startTime,
        session.endTime,
        session.durationMin,
        nowTimeVN,
      )
    ) {
      continue;
    }

    sessionsSeen.add(session.id);
    const playerId = roster.userId;
    const venueName = session.venue?.name ?? session.club?.name ?? "your court";

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

    const alreadySent = await prisma.notificationSent.findFirst({
      where: {
        recipientId: profile.id,
        type: pn7DedupType(session.id),
      },
      select: { id: true },
    });

    if (alreadySent) {
      skipped++;
      continue;
    }

    const result = await sendPushNotification(profile.id, {
      title: "You are playing 🏓",
      body: "Check and connect with players on the court now",
      data: {
        type: PN7_TYPE,
        screen: "Circle",
        sessionId: String(session.id),
        venueName,
      },
    });

    if (result.success) {
      await prisma.notificationSent.create({
        data: {
          recipientId: profile.id,
          type: pn7DedupType(session.id),
        },
      });
      sent++;
      console.log(
        `[PN7] Sent profileId=${profile.id} sessionId=${session.id} venue="${venueName}"`,
      );
    } else {
      skipped++;
      console.warn(
        `[PN7] Failed profileId=${profile.id} sessionId=${session.id} — ${result.error}`,
      );
    }
  }

  return { sent, skipped, sessions: sessionsSeen.size };
}
