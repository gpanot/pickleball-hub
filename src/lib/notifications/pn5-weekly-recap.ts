import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

/**
 * PN5: Weekly circle recap for inactive players.
 * Targets players who have been inactive for 48h+ and haven't received PN5 in last 7 days.
 */
export async function sendWeeklyRecaps() {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const eligibleProfiles = await prisma.playerProfile.findMany({
    where: {
      OR: [{ pushToken: { not: null } }, { pushTokenIos: { not: null } }],
      lastActiveAt: { lt: cutoff48h },
      notificationsReceived: {
        none: {
          type: "pn5",
          sentAt: { gte: cutoff7d },
        },
      },
    },
    select: {
      id: true,
      displayName: true,
    },
  });

  let sent = 0;

  for (const profile of eligibleProfiles) {
    const follows = await prisma.follow.findMany({
      where: { followerId: profile.id },
      select: { followeeId: true },
    });

    if (follows.length === 0) continue;

    const followeeIds = follows.map((f) => f.followeeId);

    const sessionCount = await prisma.sessionRoster.count({
      where: {
        userId: { in: followeeIds },
        scrapedAt: { gte: cutoff7d },
      },
    });

    if (sessionCount === 0) continue;

    await sendPushNotification(profile.id, {
      title: "Your circle this week",
      body: `${sessionCount} sessions played across your circle · See where they went`,
      data: { type: "pn5", screen: "Circle" },
    });

    await prisma.notificationSent.create({
      data: {
        recipientId: profile.id,
        type: "pn5",
      },
    });

    sent++;
  }

  return { sent, eligible: eligibleProfiles.length };
}
