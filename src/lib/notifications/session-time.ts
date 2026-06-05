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

export function isPnScheduleHour(): boolean {
  const h = vietnamHour();
  return h >= 7 && h < 21;
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
