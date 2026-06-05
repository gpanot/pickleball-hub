import { sendSessionFinishedKudosNotifications } from "@/lib/notifications/pn6-session-finished";
import { sendYouArePlayingNotifications } from "@/lib/notifications/pn7-you-are-playing";
import { sendWeeklyRecaps } from "@/lib/notifications/pn5-weekly-recap";
import {
  isPnScheduleHour,
  isWeeklyRecapSlot,
} from "@/lib/notifications/session-time";

/**
 * Single push-notification cron — PN6, PN7, and PN5 (Mondays 8am ICT).
 * Triggered by Railway scraper → Railway mobile API (`GET /api/cron/push-notifications`).
 */
export async function runPushNotificationsCron(): Promise<{
  ok: boolean;
  outsideHours: boolean;
  pn5: Awaited<ReturnType<typeof sendWeeklyRecaps>> | null;
  pn6: Awaited<ReturnType<typeof sendSessionFinishedKudosNotifications>>;
  pn7: Awaited<ReturnType<typeof sendYouArePlayingNotifications>>;
}> {
  const empty = { sent: 0, skipped: 0, sessions: 0 };
  const emptyPn6 = { ...empty, feedItemsCreated: 0 };

  let pn5: Awaited<ReturnType<typeof sendWeeklyRecaps>> | null = null;
  if (isWeeklyRecapSlot()) {
    pn5 = await sendWeeklyRecaps();
  }

  if (!isPnScheduleHour()) {
    return {
      ok: true,
      outsideHours: true,
      pn5,
      pn6: emptyPn6,
      pn7: empty,
    };
  }

  const pn6 = await sendSessionFinishedKudosNotifications();
  const pn7 = await sendYouArePlayingNotifications();

  return { ok: true, outsideHours: false, pn5, pn6, pn7 };
}
