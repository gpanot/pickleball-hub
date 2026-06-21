import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { isEngagementWeeklyWindowForPlayer } from "@/lib/notifications/session-time";

const PN5_TYPE = "pn5";
const PN5_ENGAGEMENT_TYPE = "pn5-engagement";

/**
 * PN5 weekly recap — two paths based on preferences.playWindow:
 *
 * Path A (unchanged): players with NO playWindow set or pre-engagement-layer players
 *   → existing circle-based recap (sessions across circle, sent Monday 8am ICT).
 *
 * Path B (new): players with playWindow = "varies" or null (post-engagement-layer)
 *   → personal recap-into-intent (Sunday evening):
 *     - Real content exists (≥1 logged session in last 7 days):
 *         title "Not bad, {name}." body lists sessions + a "Got a game?" CTA
 *     - No real content: skip recap, send intent-only nudge
 *       ("Got a game planned this week?")
 *
 * The split is done by checking preferences.engagementPlayStyle or playWindow —
 * if either is set the player has been through the engagement-layer onboarding.
 */

// ─── Path A: legacy circle recap (Monday 8am ICT) ────────────────────────────

export async function sendWeeklyRecaps() {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const eligibleProfiles = await prisma.playerProfile.findMany({
    where: {
      OR: [{ pushToken: { not: null } }, { pushTokenIos: { not: null } }],
      lastActiveAt: { lt: cutoff48h },
      notificationsReceived: {
        none: {
          type: PN5_TYPE,
          sentAt: { gte: cutoff7d },
        },
      },
    },
    select: {
      id: true,
      displayName: true,
      preferences: true,
    },
  });

  let sent = 0;

  for (const profile of eligibleProfiles) {
    const prefs = (profile.preferences as Record<string, unknown>) ?? {};
    const playWindow = (prefs.playWindow as string | null) ?? null;
    const hasEngagementLayer = !!(prefs.engagementPlayStyle || prefs.playWindow);

    // Players in the engagement layer with varies/null playWindow go through Path B
    if (hasEngagementLayer && (!playWindow || playWindow === "varies")) continue;

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
      data: { type: PN5_TYPE, screen: "Circle" },
    });

    await prisma.notificationSent.create({
      data: { recipientId: profile.id, type: PN5_TYPE },
    });

    sent++;
  }

  return { sent, eligible: eligibleProfiles.length };
}

// ─── Path B: engagement-layer recap-into-intent (Sunday evening, per-player TZ) ─

export async function sendEngagementWeeklyRecaps(): Promise<{
  sentRecap: number;
  sentIntentOnly: number;
  skipped: number;
}> {
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Target: engagement-layer players with varies or null playWindow
  const profiles = await prisma.playerProfile.findMany({
    where: {
      OR: [{ pushToken: { not: null } }, { pushTokenIos: { not: null } }],
      banned: false,
      suspended: false,
      notificationsReceived: {
        none: {
          type: PN5_ENGAGEMENT_TYPE,
          sentAt: { gte: cutoff7d },
        },
      },
    },
    select: {
      id: true,
      displayName: true,
      preferences: true,
      reclubUserId: true,
    },
  });

  let sentRecap = 0;
  let sentIntentOnly = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const prefs = (profile.preferences as Record<string, unknown>) ?? {};
    const playWindow = (prefs.playWindow as string | null) ?? null;
    const tz = (prefs.timezone as string | null) ?? null;
    const hasEngagementLayer = !!(prefs.engagementPlayStyle || prefs.playWindow);

    // Only target engagement-layer players with varies/null playWindow
    if (!hasEngagementLayer || (playWindow && playWindow !== "varies")) {
      skipped++;
      continue;
    }

    // Per-player Sunday-evening window check in their own timezone (ICT fallback)
    if (!isEngagementWeeklyWindowForPlayer(tz)) {
      skipped++;
      continue;
    }

    const name = profile.displayName ?? "there";

    // Check for real weekly content (≥1 session in last 7 days)
    let sessionCount = 0;
    if (profile.reclubUserId) {
      sessionCount = await prisma.sessionRoster.count({
        where: {
          userId: profile.reclubUserId,
          scrapedAt: { gte: cutoff7d },
        },
      });
    }

    if (sessionCount >= 1) {
      // Real content exists — send recap + intent CTA
      const sessionWord = sessionCount === 1 ? "session" : "sessions";
      await sendPushNotification(profile.id, {
        title: `Not bad, ${name}.`,
        body: `${sessionCount} ${sessionWord} this week. Got a game planned in the coming days?`,
        data: {
          type: PN5_ENGAGEMENT_TYPE,
          screen: "Squadd",
          deeplink: "intent_modal",
        },
      });
      sentRecap++;
    } else {
      // No real content — intent-only nudge, no fabricated recap
      await sendPushNotification(profile.id, {
        title: "Got a game planned this week?",
        body: "Tap to see who else is playing soon.",
        data: {
          type: PN5_ENGAGEMENT_TYPE,
          screen: "Squadd",
          deeplink: "intent_modal",
        },
      });
      sentIntentOnly++;
    }

    await prisma.notificationSent.create({
      data: { recipientId: profile.id, type: PN5_ENGAGEMENT_TYPE },
    });
  }

  return { sentRecap, sentIntentOnly, skipped };
}
