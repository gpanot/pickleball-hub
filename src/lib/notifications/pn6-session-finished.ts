import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { reclubAvatarUrl } from "@/lib/utils";

/**
 * PN6: Notify followers when a player they follow has just finished a session.
 * Prompt them to give kudos while the session is fresh.
 *
 * Also:
 *   - Creates a `played_self` feed item for the player themselves.
 *   - Creates `played_today` feed items for each follower of that player.
 *
 * Trigger: cron every 1 h (7am–9pm ICT) via GET /api/cron/session-finished-kudos.
 * Throttle: max 2 PN6 per recipient per 24 h.
 * Window: sessions whose endTime crossed in the last 65 min (cron window + 5 min buffer).
 */
export async function sendSessionFinishedKudosNotifications(): Promise<{
  sent: number;
  skipped: number;
  sessions: number;
  feedItemsCreated: number;
}> {
  const now = new Date();
  const hourICT = ((now.getUTCHours() + 7) % 24);
  if (hourICT < 7 || hourICT >= 21) {
    return { sent: 0, skipped: 0, sessions: 0, feedItemsCreated: 0 };
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
    const sessionTimestamp =
      session.snapshots?.[0]?.scrapedAt?.toISOString() ??
      `${session.scrapedDate}T${session.startTime}:00+07:00`;

    const player = await prisma.player.findUnique({
      where: { userId: playerId },
      select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
    });
    if (!player) continue;

    const playerName = player.displayName ?? "Someone in your circle";
    const playerImageUrl = player.imageUrl ?? reclubAvatarUrl(player.userId);

    // ── A: played_self feed item for the player themselves ────────────────────
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

    // ── B: played_today feed item for each follower + PN6 push ───────────────
    const followers = await prisma.follow.findMany({
      where: { followeeId: playerId },
      select: {
        follower: {
          select: { id: true, pushToken: true, pushTokenIos: true },
        },
      },
    });

    console.log(`[PN6] player=${playerName} (${playerId}) session=${session.id} followers=${followers.length}`);

    for (const { follower } of followers) {
      // played_today feed item — use consistent 2-part id format matching
      // what the live feed query produces: played_today_{playerUserId}_{sessionId}
      const todayItemId = `played_today_${playerId}_${session.id}`;
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

      // PN6 push notification
      if (!follower.pushToken && !follower.pushTokenIos) {
        console.log(`[PN6]   ⚠️  profileId=${follower.id} — no push token, skipping`);
        skipped++;
        continue;
      }

      console.log(`[PN6]   📲 profileId=${follower.id} token_android=${follower.pushToken ? follower.pushToken.slice(0, 20) + "…" : "null"} token_ios=${follower.pushTokenIos ? follower.pushTokenIos.slice(0, 20) + "…" : "null"}`);

      const alreadySentToday = await prisma.notificationSent.count({
        where: {
          recipientId: follower.id,
          type: "pn6",
          sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (alreadySentToday >= 2) {
        console.log(`[PN6]   🚫 profileId=${follower.id} — throttled (${alreadySentToday} sent in last 24h)`);
        skipped++;
        continue;
      }

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

  return { sent, skipped, sessions: finishedRosters.length, feedItemsCreated };
}
