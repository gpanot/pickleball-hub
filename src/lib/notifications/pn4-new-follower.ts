import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

/**
 * PN4: Notify a player when someone follows them.
 * Throttled to max 1 PN4 per recipient per 24h (batches feel less spammy).
 */
export async function notifyNewFollower({
  followerProfileId,
  followeeReclubUserId,
}: {
  followerProfileId: string;
  followeeReclubUserId: bigint;
}) {
  // Look up follower details for the push payload
  const followerDetails = await prisma.playerProfile.findUnique({
    where: { id: followerProfileId },
    select: {
      reclubUserId: true,
      reclubPlayer: { select: { userId: true, displayName: true, imageUrl: true } },
    },
  });
  // Find all profiles that have this reclubUserId linked — the followee may be an app user
  const targetProfile = await prisma.playerProfile.findFirst({
    where: { reclubUserId: followeeReclubUserId },
    select: { id: true, pushToken: true },
  });

  if (!targetProfile?.pushToken) return;

  // Throttle: max 1 PN4 per 24h
  const alreadySentToday = await prisma.notificationSent.count({
    where: {
      recipientId: targetProfile.id,
      type: "pn4",
      sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (alreadySentToday >= 1) return;

  // Get follower's last venue for context
  let venue = "a nearby club";
  if (followerDetails?.reclubUserId) {
    const lastRoster = await prisma.sessionRoster.findFirst({
      where: { userId: followerDetails.reclubUserId },
      orderBy: { scrapedAt: "desc" },
      include: { session: { include: { venue: true } } },
    });
    if (lastRoster?.session.venue?.name) {
      venue = lastRoster.session.venue.name;
    }
  }

  const followerName = followerDetails?.reclubPlayer?.displayName ?? null;
  const followerUserId = followerDetails?.reclubPlayer?.userId
    ? String(followerDetails.reclubPlayer.userId)
    : null;
  const followerImageUrl = followerDetails?.reclubPlayer?.imageUrl ?? null;

  await sendPushNotification({
    token: targetProfile.pushToken,
    title: "Someone is following your game",
    body: followerName
      ? `${followerName} is now following you`
      : `A player who's been at ${venue} is now following you`,
    data: {
      type: "pn4",
      screen: "Circle",
      followerUserId: followerUserId ?? "",
      followerName: followerName ?? "",
      followerImageUrl: followerImageUrl ?? "",
    },
  });

  await prisma.notificationSent.create({
    data: {
      recipientId: targetProfile.id,
      senderId: followerProfileId,
      type: "pn4",
    },
  });
}
