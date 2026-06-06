import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { reclubAvatarUrl } from "@/lib/utils";

/**
 * PN8: Notify followers when someone sets up their gear.
 * Creates a `gear_setup` feed item for each follower and sends a push.
 * Dedup: one per player per gear save (notifications_sent type `pn8:{profileId}`).
 */
export async function notifyGearSetup({
  profileId,
  gear,
}: {
  profileId: string;
  gear: { cap: string | null; shirt: string | null; paddle: string | null; shoes: string | null };
}) {
  const profile = await prisma.playerProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      reclubUserId: true,
      reclubPlayer: {
        select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
      },
    },
  });
  if (!profile?.reclubPlayer) return;

  const player = profile.reclubPlayer;
  const playerName = player.displayName ?? "Someone";
  const playerImageUrl = player.imageUrl ?? reclubAvatarUrl(player.userId);

  const followers = await prisma.follow.findMany({
    where: { followeeId: player.userId },
    select: {
      follower: {
        select: { id: true, pushToken: true, pushTokenIos: true },
      },
    },
  });

  if (followers.length === 0) return;

  const dedupeType = `pn8:${profileId}`;
  const now = new Date();
  const feedTimestamp = now.toISOString();

  for (const { follower } of followers) {
    const feedItemId = `gear_setup_${player.userId}_${follower.id}`;
    await prisma.feedItem.upsert({
      where: { id: feedItemId },
      create: {
        id: feedItemId,
        profileId: follower.id,
        type: "gear_setup",
        playerUserId: player.userId.toString(),
        payload: {
          id: feedItemId,
          type: "gear_setup",
          player: {
            userId: player.userId.toString(),
            displayName: player.displayName,
            imageUrl: playerImageUrl,
            duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
          },
          gear,
          isFollowing: true,
          timestamp: feedTimestamp,
        },
        timestamp: now,
      },
      update: {
        payload: {
          id: feedItemId,
          type: "gear_setup",
          player: {
            userId: player.userId.toString(),
            displayName: player.displayName,
            imageUrl: playerImageUrl,
            duprDoubles: player.duprDoubles ? Number(player.duprDoubles) : null,
          },
          gear,
          isFollowing: true,
          timestamp: feedTimestamp,
        },
        timestamp: now,
      },
    });

    if (!follower.pushToken && !follower.pushTokenIos) continue;

    const alreadySent = await prisma.notificationSent.findFirst({
      where: { recipientId: follower.id, type: dedupeType },
      select: { id: true },
    });
    if (alreadySent) continue;

    const result = await sendPushNotification(follower.id, {
      title: `${playerName} set up their gear 🏓`,
      body: `Want to have a look at it?`,
      data: {
        type: "pn8",
        screen: "Circle",
        followeeUserId: player.userId.toString(),
        followeeProfileId: profileId,
      },
    });

    if (result.success) {
      await prisma.notificationSent.create({
        data: {
          recipientId: follower.id,
          senderId: profileId,
          type: dedupeType,
        },
      });
    }
  }
}
