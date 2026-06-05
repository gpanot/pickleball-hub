/**
 * Fire every PN type to giompanot@gmail.com for end-to-end FCM verification.
 * Usage: set -a && source .env.production && source .env.local && set +a && npx tsx scripts/fire-all-pns-giompanot.ts
 */
import { PrismaClient } from "@prisma/client";
import { sendPushNotification } from "../src/lib/notifications";

const EMAIL = "giompanot@gmail.com";
const DELAY_MS = 4000;
const prisma = new PrismaClient();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: {
      profile: {
        select: { id: true, displayName: true, pushToken: true, pushTokenIos: true },
      },
    },
  });

  if (!user?.profile) throw new Error(`No profile for ${EMAIL}`);
  const profile = user.profile;

  if (!profile.pushToken && !profile.pushTokenIos) {
    throw new Error("No push tokens on profile");
  }

  console.log("Target:", EMAIL, profile.id);
  console.log("Android:", profile.pushToken?.slice(0, 24) + "…");
  console.log("iOS:", profile.pushTokenIos?.slice(0, 24) + "…");
  console.log("");

  const tests: Array<{ label: string; payload: Parameters<typeof sendPushNotification>[1] }> = [
    {
      label: "PN1 — friend joining",
      payload: {
        title: "Maxime is joining tonight",
        body: "Evening Open Play · 19:00 · 3 spots left",
        data: { type: "pn1", sessionId: "999001", screen: "Shortlist" },
      },
    },
    {
      label: "PN4 — new follower",
      payload: {
        title: "Someone is following your game",
        body: "Chris Grey is now following you",
        data: {
          type: "pn4",
          screen: "Circle",
          followerUserId: "393728",
          followerName: "Chris Grey",
          followerImageUrl: "",
        },
      },
    },
    {
      label: "PN5 — weekly recap",
      payload: {
        title: "Your circle this week",
        body: "12 sessions played across your circle · See where they went",
        data: { type: "pn5", screen: "Circle" },
      },
    },
    {
      label: "PN6 — friend finished",
      payload: {
        title: "Maxime just finished playing 🏓",
        body: "Give them a fist bump for their session at Big Balls Pickle Club",
        data: {
          type: "pn6",
          screen: "Circle",
          followeeUserId: "108239",
          sessionId: "999002",
        },
      },
    },
    {
      label: "PN7 — you are playing",
      payload: {
        title: "You are playing 🏓",
        body: "Check and connect with players on the court now",
        data: {
          type: "pn7",
          screen: "Circle",
          sessionId: "999003",
          venueName: "matchup Sports Complex",
        },
      },
    },
    {
      label: "Kudos — fist bump",
      payload: {
        title: "🤜 Maxime gave you a fist bump",
        body: "Open Squadd to see your kudos",
        data: { type: "kudos", screen: "Circle" },
      },
    },
  ];

  const results: Array<{ label: string; ok: boolean; error?: string }> = [];

  for (const t of tests) {
    console.log(`Sending: ${t.label}…`);
    const r = await sendPushNotification(profile.id, t.payload);
    results.push({ label: t.label, ok: r.success, error: r.error });
    console.log(r.success ? "  ✅ sent" : `  ❌ ${r.error}`);
    await sleep(DELAY_MS);
  }

  console.log("\n=== Summary ===");
  for (const r of results) {
    console.log(r.ok ? "✅" : "❌", r.label, r.error ?? "");
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
