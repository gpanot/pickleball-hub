/**
 * Period helpers for the club dashboard.
 * All date ranges are computed in Asia/Ho_Chi_Minh timezone then returned as
 * UTC Date objects suitable for Prisma DateTime comparisons.
 */

export type DashboardPeriod =
  | "this_month"
  | "last_month"
  | "this_week"
  | "last_week"
  | "all";

const TZ = "Asia/Ho_Chi_Minh";

/** Returns UTC start/end Date for a period, or null for "all". */
export function periodBounds(
  period: DashboardPeriod,
): { start: Date; end: Date } | null {
  if (period === "all") return null;

  const now = new Date();
  // Current date parts in HCM timezone
  const localStr = now.toLocaleString("en-CA", { timeZone: TZ, hour12: false });
  // en-CA gives "YYYY-MM-DD, HH:MM:SS"
  const [datePart] = localStr.split(",");
  const [year, month, day] = datePart.trim().split("-").map(Number);
  const dow = new Date(
    now.toLocaleString("en-US", { timeZone: TZ }),
  ).getDay(); // 0=Sun

  let startLocal: Date;
  let endLocal: Date;

  if (period === "this_month") {
    startLocal = localDate(year, month, 1);
    endLocal = localDate(year, month + 1, 1);
  } else if (period === "last_month") {
    const lm = month === 1 ? 12 : month - 1;
    const ly = month === 1 ? year - 1 : year;
    startLocal = localDate(ly, lm, 1);
    endLocal = localDate(year, month, 1);
  } else if (period === "this_week") {
    // Week starts Monday
    const diffToMon = (dow + 6) % 7;
    startLocal = localDate(year, month, day - diffToMon);
    endLocal = localDate(year, month, day - diffToMon + 7);
  } else {
    // last_week
    const diffToMon = (dow + 6) % 7;
    startLocal = localDate(year, month, day - diffToMon - 7);
    endLocal = localDate(year, month, day - diffToMon);
  }

  // Convert HCM midnight to UTC by subtracting +07:00 offset (25200 s)
  const start = new Date(startLocal.getTime() - 7 * 3600 * 1000);
  const end = new Date(endLocal.getTime() - 7 * 3600 * 1000);
  return { start, end };
}

/** Returns human-readable label for the period selector. */
export function periodLabel(period: DashboardPeriod): string {
  const map: Record<DashboardPeriod, string> = {
    this_month: "This Month",
    last_month: "Last Month",
    this_week: "This Week",
    last_week: "Last Week",
    all: "All Sessions",
  };
  return map[period];
}

/** Constructs a Date representing midnight HCM time for given year/month/day. */
function localDate(year: number, month: number, day: number): Date {
  // Use JS Date UTC to represent a "local midnight" value before offset conversion.
  // month is 1-based here.
  return new Date(Date.UTC(year, month - 1, day));
}
