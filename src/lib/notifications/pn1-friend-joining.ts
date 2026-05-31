import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

/**
 * PN1: Notify followers when a player joins/shortlists a session.
 * Throttled to max 3 PN1 per recipient per 24h. Silent outside 7am–9pm.
 */
export async function notifyCircleOfJoining({
  profileId,
  sessionName,
  venueName,
  sessionTime,
  spotsLeft,
  sessionId,
}: {
  profileId: string;
  sessionName: string;
  venueName: string;
  sessionTime: string;
  spotsLeft: number;
  sessionId: string;
}) {
  const now = new Date();
  const hour = now.getUTCHours() + 7; // ICT offset
  if (hour < 7 || hour >= 21) return;

  const profile = await prisma.playerProfile.findUnique({
    where: { id: profileId },
    select: { displayName: true, reclubUserId: true },
  });
  if (!profile?.reclubUserId) return;

  const name = profile.displayName || "Someone in your circle";

  const followers = await prisma.follow.findMany({
    where: { followeeId: profile.reclubUserId },
    select: {
      follower: {
        select: {
          id: true,
          pushToken: true,
          pushTokenIos: true,
        },
      },
    },
  });

  for (const { follower } of followers) {
    if (!follower.pushToken && !follower.pushTokenIos) continue;

    const sentToday = await prisma.notificationSent.count({
      where: {
        recipientId: follower.id,
        type: "pn1",
        sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (sentToday >= 3) continue;

    await sendPushNotification(follower.id, {
      title: `${name} is joining tonight`,
      body: `${sessionName} · ${sessionTime} · ${spotsLeft} spots left`,
      data: { type: "pn1", sessionId, screen: "Shortlist" },
    });

    await prisma.notificationSent.create({
      data: {
        recipientId: follower.id,
        senderId: profileId,
        type: "pn1",
      },
    });
  }
}
