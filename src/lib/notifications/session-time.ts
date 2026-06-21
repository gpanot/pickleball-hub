/** Vietnam (ICT) date/time helpers — same offset hack used across feed + cron PNs. */

export function vietnamNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

export function vietnamHour(): number {
  return (new Date().getUTCHours() + 7) % 24;
}

export function vietnamTodayStr(vnNow = vietnamNow()): string {
  return vnNow.toISOString().slice(0, 10);
}

export function vietnamTimeStr(vnNow = vietnamNow()): string {
  return vnNow.toISOString().slice(11, 16);
}

/** ISO timestamp for when a session ended (VN +07:00). Used for feed + PN6 display time. */
export function sessionEndTimestamp(
  scrapedDate: string,
  endTime: string,
): string {
  return `${scrapedDate}T${endTime}:00+07:00`;
}

/** ISO timestamp for when a session started (VN +07:00). */
export function sessionStartTimestamp(
  scrapedDate: string,
  startTime: string,
): string {
  return `${scrapedDate}T${startTime}:00+07:00`;
}

export function minutesFromTimeStr(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Session is in progress (matches feed route you_are_playing logic). */
export function isSessionLive(
  startTime: string,
  endTime: string | null | undefined,
  durationMin: number | null | undefined,
  nowTimeVN: string,
): boolean {
  if (startTime > nowTimeVN) return false;

  if (endTime) {
    return endTime > nowTimeVN;
  }

  if (durationMin) {
    return minutesFromTimeStr(nowTimeVN) < minutesFromTimeStr(startTime) + durationMin;
  }

  return minutesFromTimeStr(nowTimeVN) < minutesFromTimeStr(startTime) + 120;
}

/** Session ended recently: end time is in (windowStart, now] for today's scrape. */
export function isSessionEndedInWindow(
  endTime: string,
  windowStartTime: string,
  nowTimeVN: string,
): boolean {
  return endTime > windowStartTime && endTime <= nowTimeVN;
}

/** 7:00–22:59 ICT — covers evening sessions that end at 21:00–22:00. */
export function isPnScheduleHour(): boolean {
  const h = vietnamHour();
  return h >= 7 && h < 23;
}

/** 0=Sun, 1=Mon, … — ICT calendar day from the same offset hack as vietnamHour. */
export function vietnamDayOfWeek(): number {
  const vn = vietnamNow();
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()),
  ).getUTCDay();
}

/** PN5 weekly recap: Monday 08:00 ICT (first cron tick in that hour). */
export function isWeeklyRecapSlot(): boolean {
  return vietnamDayOfWeek() === 1 && vietnamHour() === 8;
}

// ─── Timezone-aware helpers for engagement notification engine ────────────────

/** IANA timezone fallback when player hasn't set one yet. */
const DEFAULT_TZ = "Asia/Ho_Chi_Minh";

/**
 * Returns the current local hour (0–23) in the given IANA timezone.
 * Falls back to DEFAULT_TZ if the timezone is invalid.
 */
export function localHourForTimezone(tz: string | null | undefined): number {
  const safeTz = tz ?? DEFAULT_TZ;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: safeTz,
    });
    const hourStr = formatter.format(new Date());
    const h = parseInt(hourStr, 10);
    return isNaN(h) ? vietnamHour() : h % 24;
  } catch {
    return vietnamHour();
  }
}

/**
 * Returns the current local day of week (0=Sun, 1=Mon…6=Sat) for a timezone.
 * Falls back to DEFAULT_TZ if invalid.
 */
export function localDayOfWeekForTimezone(tz: string | null | undefined): number {
  const safeTz = tz ?? DEFAULT_TZ;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: safeTz,
    });
    const day = formatter.format(new Date());
    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return map[day] ?? vietnamDayOfWeek();
  } catch {
    return vietnamDayOfWeek();
  }
}

export type PlayWindow = "mornings" | "after_work" | "weekends" | "varies";

/**
 * Returns true if the current cron tick falls inside the player's habit send-window,
 * evaluated in their own local timezone. Window definitions (local hours):
 *   mornings   → 07:00–08:59
 *   after_work → 17:00–18:59
 *   weekends   → Sat/Sun 09:00–11:59
 *   varies / null → always false (handled by weekly recap path)
 */
export function isHabitWindow(
  playWindow: PlayWindow | string | null | undefined,
  tz: string | null | undefined,
): boolean {
  if (!playWindow || playWindow === "varies") return false;

  const hour = localHourForTimezone(tz);
  const dow = localDayOfWeekForTimezone(tz);

  switch (playWindow as PlayWindow) {
    case "mornings":
      return hour >= 7 && hour < 9;
    case "after_work":
      return hour >= 17 && hour < 19;
    case "weekends":
      return (dow === 0 || dow === 6) && hour >= 9 && hour < 12;
    default:
      return false;
  }
}

/**
 * Coarse cron guard: returns true during the window when at least one player somewhere
 * in the world could be in their "Sunday evening" (17:00–20:59 local).
 *
 * Sunday 17:00 in UTC+14 (earliest TZ) = Saturday 03:00 UTC.
 * Sunday 20:59 in UTC-12 (latest TZ)   = Monday 08:59 UTC.
 *
 * So the cron needs to run sendEngagementWeeklyRecaps from Sat 03:00 UTC through
 * Mon 08:59 UTC. The per-player check inside the function uses the precise local window.
 *
 * We keep this as a broad day-of-week guard: runs any cron tick whose UTC day is
 * Saturday, Sunday, or Monday — not just a 1-hour slot — so no timezone is missed.
 */
export function isEngagementWeeklySlot(): boolean {
  const utcDay = new Date().getUTCDay(); // 0=Sun, 1=Mon, 6=Sat
  return utcDay === 6 || utcDay === 0 || utcDay === 1;
}

/**
 * Returns true if the current cron tick falls inside "Sunday evening" for the given
 * player timezone (Sunday 17:00–20:59 local). Used for per-player engagement recap
 * gating — replaces the single global isEngagementWeeklySlot() cron check.
 * Falls back to ICT if timezone is null/invalid.
 */
export function isEngagementWeeklyWindowForPlayer(tz: string | null | undefined): boolean {
  const dow = localDayOfWeekForTimezone(tz);
  const hour = localHourForTimezone(tz);
  return dow === 0 && hour >= 17 && hour < 21;
}
