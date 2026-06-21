import { sendSessionFinishedKudosNotifications } from "@/lib/notifications/pn6-session-finished";
import { sendYouArePlayingNotifications } from "@/lib/notifications/pn7-you-are-playing";
import { sendWeeklyRecaps, sendEngagementWeeklyRecaps } from "@/lib/notifications/pn5-weekly-recap";
import { sendEngagementNotifications } from "@/lib/notifications/pn-engagement";
import {
  isPnScheduleHour,
  isWeeklyRecapSlot,
  isEngagementWeeklySlot,
} from "@/lib/notifications/session-time";

/**
 * Single push-notification cron — PN6, PN7, PN5 (Mondays 8am ICT),
 * and PN-engagement (habit-window per-player TZ + Sunday recap for varies players).
 *
 * isEngagementWeeklySlot() is a coarse ICT guard that widens the window enough to
 * cover players in timezones up to UTC-11 (their Sunday evening can start as early
 * as Sun 00:00 ICT) and up to UTC+14 (Mon 09:00 ICT). The precise per-player
 * Sunday-evening check happens inside sendEngagementWeeklyRecaps() using
 * isEngagementWeeklyWindowForPlayer(tz).
 *
 * Triggered by Railway scraper → Railway mobile API (`GET /api/cron/push-notifications`).
 */
export async function runPushNotificationsCron(): Promise<{
  ok: boolean;
  outsideHours: boolean;
  pn5: Awaited<ReturnType<typeof sendWeeklyRecaps>> | null;
  pn5Engagement: Awaited<ReturnType<typeof sendEngagementWeeklyRecaps>> | null;
  pn6: Awaited<ReturnType<typeof sendSessionFinishedKudosNotifications>>;
  pn7: Awaited<ReturnType<typeof sendYouArePlayingNotifications>>;
  pnEngagement: Awaited<ReturnType<typeof sendEngagementNotifications>> | null;
}> {
  const empty = { sent: 0, skipped: 0, sessions: 0, feedItemsCreated: 0 };
  const emptyPn6 = { ...empty, feedItemsCreated: 0 };
  const emptyEngagement = { sent: 0, skipped: 0, backedOff: 0 };

  let pn5: Awaited<ReturnType<typeof sendWeeklyRecaps>> | null = null;
  if (isWeeklyRecapSlot()) {
    pn5 = await sendWeeklyRecaps();
  }

  // Sunday 19:00 ICT: engagement weekly recap for varies/null playWindow players
  let pn5Engagement: Awaited<ReturnType<typeof sendEngagementWeeklyRecaps>> | null = null;
  if (isEngagementWeeklySlot()) {
    pn5Engagement = await sendEngagementWeeklyRecaps();
  }

  // PN-engagement: habit-window notifications fire on every cron tick inside schedule hours;
  // the isHabitWindow() check inside pn-engagement.ts handles per-player gating.
  let pnEngagement: Awaited<ReturnType<typeof sendEngagementNotifications>> | null = null;
  if (isPnScheduleHour() || isEngagementWeeklySlot()) {
    pnEngagement = await sendEngagementNotifications();
  }

  if (!isPnScheduleHour()) {
    return {
      ok: true,
      outsideHours: true,
      pn5,
      pn5Engagement,
      pn6: emptyPn6,
      pn7: empty,
      pnEngagement,
    };
  }

  const pn6 = await sendSessionFinishedKudosNotifications();
  const pn7 = await sendYouArePlayingNotifications();

  return { ok: true, outsideHours: false, pn5, pn5Engagement, pn6, pn7, pnEngagement };
}
