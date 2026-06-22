import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { isHabitWindow } from "@/lib/notifications/session-time";

const PN_ENGAGEMENT_TYPE = "pn-engagement";

/**
 * PN-Engagement: Habit-window + backoff notification engine (Section 4a).
 *
 * For each player who has a non-null, non-"varies" playWindow in preferences:
 *   1. Check if the current cron tick falls inside their habit send-window,
 *      evaluated in their own IANA timezone (falls back to Asia/Ho_Chi_Minh).
 *   2. Apply backoff: skip if preferences.engagementBackoff.nextEligibleAt > now.
 *   3. Send if eligible and not already sent in the last 5 days.
 *   4. Track consecutive no-response dismissals — after 2, back off 14 days.
 *
 * Backoff shape stored in preferences.engagementBackoff:
 *   { dismissals: number, nextEligibleAt: ISO, lastSentAt: ISO }
 *
 * "No response" = no app open (lastActiveAt not updated) within 24h of lastSentAt.
 * This is checked on the next cron tick after lastSentAt + 24h.
 */
export async function sendEngagementNotifications(): Promise<{
  sent: number;
  skipped: number;
  backedOff: number;
}> {
  const now = new Date();
  const cutoff5d = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  // Fetch candidates: have a push token, have playWindow set, not varies/null
  const profiles = await prisma.playerProfile.findMany({
    where: {
      OR: [{ pushToken: { not: null } }, { pushTokenIos: { not: null } }],
      banned: false,
      suspended: false,
    },
    select: {
      id: true,
      displayName: true,
      preferences: true,
      lastActiveAt: true,
      notificationsReceived: {
        where: { type: PN_ENGAGEMENT_TYPE, sentAt: { gte: cutoff5d } },
        select: { sentAt: true },
        orderBy: { sentAt: "desc" },
        take: 1,
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  let backedOff = 0;

  for (const profile of profiles) {
    const prefs = (profile.preferences as Record<string, unknown>) ?? {};
    const playWindow = (prefs.playWindow as string | null) ?? null;
    const tz = (prefs.timezone as string | null) ?? null;

    // Skip varies / null — handled by weekly recap path
    if (!playWindow || playWindow === "varies") {
      skipped++;
      continue;
    }

    // Check habit window in player's local timezone
    if (!isHabitWindow(playWindow, tz)) {
      skipped++;
      continue;
    }

    // Suppress if player already has an active, specific intent (not "not_sure")
    // — they've already committed, no need to prompt them.
    const activeIntent = (prefs.dayOneIntent as string | null) ?? null
    const intentExpiresAt = (prefs.dayOneIntentExpiresAt as string | null) ?? null
    if (
      activeIntent &&
      activeIntent !== 'not_sure' &&
      intentExpiresAt &&
      new Date(intentExpiresAt) > now
    ) {
      skipped++;
      continue;
    }

    // Already sent within dedup window
    if (profile.notificationsReceived.length > 0) {
      skipped++;
      continue;
    }

    // Resolve backoff state
    const backoff = (prefs.engagementBackoff as {
      dismissals?: number;
      nextEligibleAt?: string;
      lastSentAt?: string;
    } | null) ?? {};

    // Check if currently in backoff period
    if (backoff.nextEligibleAt && new Date(backoff.nextEligibleAt) > now) {
      backedOff++;
      continue;
    }

    // Check if last send went unanswered (no app open within 24h)
    let newDismissals = backoff.dismissals ?? 0;
    if (backoff.lastSentAt) {
      const lastSent = new Date(backoff.lastSentAt);
      const windowClosed = new Date(lastSent.getTime() + 24 * 60 * 60 * 1000) < now;
      const respondedAfterLastSend =
        profile.lastActiveAt && profile.lastActiveAt > lastSent;
      if (windowClosed && !respondedAfterLastSend) {
        newDismissals += 1;
      } else {
        newDismissals = 0; // reset on response
      }
    }

    // Apply backoff after 2 consecutive no-responses
    if (newDismissals >= 2) {
      const nextEligible = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      await prisma.playerProfile.update({
        where: { id: profile.id },
        data: {
          preferences: {
            ...prefs,
            engagementBackoff: {
              dismissals: newDismissals,
              nextEligibleAt: nextEligible.toISOString(),
              lastSentAt: backoff.lastSentAt ?? null,
            },
          },
        },
      });
      backedOff++;
      continue;
    }

    // Send the notification
    const name = profile.displayName ?? "there";
    await sendPushNotification(profile.id, {
      title: `Hey ${name}`,
      body: "Got a game this week?",
      data: {
        type: PN_ENGAGEMENT_TYPE,
        screen: "Squadd",
        deeplink: "intent_modal",
      },
    });

    await prisma.notificationSent.create({
      data: { recipientId: profile.id, type: PN_ENGAGEMENT_TYPE },
    });

    // Update backoff tracking
    await prisma.playerProfile.update({
      where: { id: profile.id },
      data: {
        preferences: {
          ...prefs,
          engagementBackoff: {
            dismissals: newDismissals,
            nextEligibleAt: backoff.nextEligibleAt ?? null,
            lastSentAt: now.toISOString(),
          },
        },
      },
    });

    sent++;
  }

  return { sent, skipped, backedOff };
}
