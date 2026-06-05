import { sendSessionFinishedKudosNotifications } from "@/lib/notifications/pn6-session-finished";
import { sendYouArePlayingNotifications } from "@/lib/notifications/pn7-you-are-playing";
import { isPnScheduleHour } from "@/lib/notifications/session-time";

/**
 * Single push-notification cron — PN6 (friend finished) + PN7 (you are playing).
 * Triggered by Railway scraper → Railway mobile API (`GET /api/cron/push-notifications`).
 */
export async function runPushNotificationsCron(): Promise<{
  ok: boolean;
  outsideHours: boolean;
  pn6: Awaited<ReturnType<typeof sendSessionFinishedKudosNotifications>>;
  pn7: Awaited<ReturnType<typeof sendYouArePlayingNotifications>>;
}> {
  if (!isPnScheduleHour()) {
    const empty = { sent: 0, skipped: 0, sessions: 0 };
    return {
      ok: true,
      outsideHours: true,
      pn6: { ...empty, feedItemsCreated: 0 },
      pn7: empty,
    };
  }

  const pn6 = await sendSessionFinishedKudosNotifications();
  const pn7 = await sendYouArePlayingNotifications();

  return { ok: true, outsideHours: false, pn6, pn7 };
}
