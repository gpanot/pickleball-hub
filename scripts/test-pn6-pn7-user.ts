/**
 * Validate PN6/PN7 for giompanot@gmail.com against production DB + FCM.
 * Usage:
 *   DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d= -f2- | tr -d '"') \
 *   FIREBASE_SERVICE_ACCOUNT_JSON=... \
 *   npx tsx scripts/test-pn6-pn7-user.ts
 */
import { PrismaClient } from "@prisma/client";
import { sendSessionFinishedKudosNotifications } from "../src/lib/notifications/pn6-session-finished";
import { sendYouArePlayingNotifications } from "../src/lib/notifications/pn7-you-are-playing";

const EMAIL = "giompanot@gmail.com";
const prisma = new PrismaClient();

async function main() {
  const profile = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: {
      profile: {
        select: { id: true, pushToken: true, pushTokenIos: true },
      },
    },
  });

  if (!profile?.profile) {
    throw new Error(`No profile for ${EMAIL}`);
  }

  console.log("Profile", profile.profile.id);
  console.log("Has push token:", !!(profile.profile.pushToken || profile.profile.pushTokenIos));

  const before = await prisma.notificationSent.findMany({
    where: {
      recipientId: profile.profile.id,
      OR: [{ type: { startsWith: "pn6:" } }, { type: { startsWith: "pn7:" } }],
    },
    orderBy: { sentAt: "desc" },
    take: 5,
  });
  console.log("Before — recent pn6/pn7 records:", before.length);
  before.forEach((n) => console.log(" ", n.type, n.sentAt.toISOString()));

  console.log("\n--- Running PN6 ---");
  const r6 = await sendSessionFinishedKudosNotifications();
  console.log(JSON.stringify(r6));

  console.log("\n--- Running PN7 ---");
  const r7 = await sendYouArePlayingNotifications();
  console.log(JSON.stringify(r7));

  const after = await prisma.notificationSent.findMany({
    where: {
      recipientId: profile.profile.id,
      OR: [{ type: { startsWith: "pn6:" } }, { type: { startsWith: "pn7:" } }],
    },
    orderBy: { sentAt: "desc" },
    take: 10,
  });
  console.log("\nAfter — pn6/pn7 records:", after.length);
  after.forEach((n) => console.log(" ", n.type, n.sentAt.toISOString()));

  const newRecords = after.filter(
    (a) => !before.some((b) => b.id === a.id),
  );
  if (newRecords.length === 0 && r6.sent === 0 && r7.sent === 0) {
    console.warn("\n⚠️  No new pushes (session may not be in window right now).");
  } else {
    console.log("\n✅ New notification records:", newRecords.length);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
