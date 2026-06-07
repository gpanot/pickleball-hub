/**
 * Debug PN6/PN7 for a user — read-only production investigation.
 * Usage: set -a && source .env.production && set +a && npx tsx scripts/debug-pn6-pn7-user.ts
 */
import { PrismaClient } from "@prisma/client";

const EMAIL = process.env.DEBUG_EMAIL ?? "giompanot@gmail.com";
const HOURS_BACK = Number(process.env.HOURS_BACK ?? "8");

const prisma = new PrismaClient();

function vnNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function timeStr(d: Date): string {
  return d.toISOString().slice(11, 16);
}

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - HOURS_BACK * 60 * 60 * 1000);
  const vn = vnNow();
  const todayStr = vn.toISOString().slice(0, 10);
  const nowTimeVN = timeStr(vn);

  console.log("=== Context ===");
  console.log("UTC now:", now.toISOString());
  console.log("VN now:", vn.toISOString(), "| today:", todayStr, "| time:", nowTimeVN);
  console.log("Looking back", HOURS_BACK, "h since", since.toISOString());
  console.log("");

  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: {
      profile: {
        select: {
          id: true,
          reclubUserId: true,
          displayName: true,
          pushToken: true,
          pushTokenIos: true,
          pushTokenUpdatedAt: true,
          lastActiveAt: true,
        },
      },
    },
  });

  if (!user?.profile) {
    console.error("No profile for", EMAIL);
    process.exit(1);
  }

  const profile = user.profile;
  const reclubId = profile.reclubUserId;
  console.log("=== Profile ===");
  console.log("profileId:", profile.id);
  console.log("reclubUserId:", reclubId?.toString() ?? "null");
  console.log("pushToken:", profile.pushToken ? `${profile.pushToken.slice(0, 24)}… (${profile.pushToken.length})` : "null");
  console.log("pushTokenIos:", profile.pushTokenIos ? `${profile.pushTokenIos.slice(0, 24)}…` : "null");
  console.log("pushTokenUpdatedAt:", profile.pushTokenUpdatedAt?.toISOString() ?? "null");
  console.log("");

  // Feed items last 8h
  const feedItems = await prisma.feedItem.findMany({
    where: {
      profileId: profile.id,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "desc" },
    select: { id: true, type: true, timestamp: true, playerUserId: true, payload: true },
  });

  console.log("=== Feed items (last", HOURS_BACK, "h):", feedItems.length, "===");
  for (const f of feedItems) {
    const p = f.payload as Record<string, unknown>;
    console.log(
      `  ${f.timestamp.toISOString()} | ${f.type} | id=${f.id}`,
      p?.venueName ? `venue=${p.venueName}` : "",
      p?.sessionId ? `session=${p.sessionId}` : "",
    );
  }
  console.log("");

  // PN6/PN7 guards and pn7_guard
  const pnGuards = await prisma.feedItem.findMany({
    where: {
      profileId: profile.id,
      OR: [
        { id: { startsWith: "pn7_" } },
        { type: "pn7_guard" },
      ],
    },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  console.log("=== PN7 guard feed items:", pnGuards.length, "===");
  for (const g of pnGuards) console.log(" ", g.id, g.timestamp.toISOString());
  console.log("");

  // Notifications sent
  const notifs = await prisma.notificationSent.findMany({
    where: {
      recipientId: profile.id,
      type: { in: ["pn6", "pn7"] },
      sentAt: { gte: since },
    },
    orderBy: { sentAt: "desc" },
  });
  console.log("=== notificationSent pn6/pn7 (last", HOURS_BACK, "h):", notifs.length, "===");
  for (const n of notifs) console.log(" ", n.type, n.sentAt.toISOString());

  const pn6Last24 = await prisma.notificationSent.count({
    where: {
      recipientId: profile.id,
      type: "pn6",
      sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  console.log("PN6 count last 24h (throttle limit 2):", pn6Last24);
  console.log("");

  if (!reclubId) {
    console.log("No reclubUserId — cannot check sessions");
    return;
  }

  // My sessions today
  const myRostersToday = await prisma.sessionRoster.findMany({
    where: {
      userId: reclubId,
      session: { scrapedDate: todayStr },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          status: true,
          scrapedDate: true,
          venue: { select: { name: true } },
          club: { select: { name: true } },
        },
      },
    },
  });

  console.log("=== My sessions today (", todayStr, "):", myRostersToday.length, "===");
  for (const r of myRostersToday) {
    const s = r.session;
    const venue = s.venue?.name ?? s.club?.name ?? "?";
    console.log(
      `  session ${s.id} | ${s.startTime}-${s.endTime} | status=${s.status} | ${venue}`,
    );

    // Would PN7 match right now?
    const windowMins = 35;
    const windowStart = new Date(vn.getTime() - windowMins * 60 * 1000);
    const windowStartTime = timeStr(windowStart);
    const pn7Match =
      s.startTime > windowStartTime &&
      s.startTime <= nowTimeVN &&
      s.status === "active";
    console.log(
      `    PN7 window now: start in (${windowStartTime}, ${nowTimeVN}] & active=${s.status === "active"} → ${pn7Match ? "MATCH" : "no match"}`,
    );

    const windowMins6 = 65;
    const windowStart6 = new Date(vn.getTime() - windowMins6 * 60 * 1000);
    const windowStartTime6 = timeStr(windowStart6);
    const pn6SelfEnd =
      s.endTime > windowStartTime6 && s.endTime <= nowTimeVN;
    console.log(
      `    PN6 self end window now: end in (${windowStartTime6}, ${nowTimeVN}] → ${pn6SelfEnd ? "would create played_self" : "no"}`,
    );
  }
  console.log("");

  // Friends who finished — PN6 I should receive as follower
  const following = await prisma.follow.findMany({
    where: { followerId: profile.id },
    select: { followeeId: true },
  });
  const followeeIds = following.map((f) => f.followeeId);

  const friendsFinishedToday = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: { scrapedDate: todayStr },
    },
    include: {
      session: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          venue: { select: { name: true } },
        },
      },
      player: { select: { displayName: true } },
    },
  });

  console.log("=== Followed players sessions today:", friendsFinishedToday.length, "rosters ===");
  const windowStart6 = timeStr(new Date(vn.getTime() - 65 * 60 * 1000));
  for (const r of friendsFinishedToday) {
    const s = r.session;
    const inPn6Window = s.endTime > windowStart6 && s.endTime <= nowTimeVN;
    const playedTodayId = `played_today_${r.userId}_${s.id}_${user.profile.id}`;
    const feedExists = await prisma.feedItem.findUnique({ where: { id: playedTodayId }, select: { id: true } });
    console.log(
      `  ${r.player.displayName} session ${s.id} ${s.startTime}-${s.endTime} status=${s.status}`,
      `| PN6 end window now: ${inPn6Window ? "YES" : "no"}`,
      `| played_today feed: ${feedExists ? "exists" : "missing"}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
