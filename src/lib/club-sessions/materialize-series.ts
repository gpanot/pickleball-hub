/**
 * Materialization service for recurring session series.
 *
 * Maintains a rolling 8-week forward window of ClubSession occurrences for each
 * active SessionSeries. Idempotent — safe to call multiple times in the same minute.
 */
import { prisma } from "@/lib/db";

/** Parse "HH:MM" into { hours, minutes }. */
function parseLocalTime(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

/**
 * Convert a local date + time to a UTC DateTime using a UTC offset in minutes.
 * This is a lightweight substitute for date-fns-tz that avoids a runtime dependency.
 * Asia/Ho_Chi_Minh is UTC+7; the offset is resolved from the series timezone at call time.
 */
function localToUtc(
  year: number,
  month: number, // 0-indexed
  day: number,
  hours: number,
  minutes: number,
  offsetMinutes: number,
): Date {
  const localMs =
    Date.UTC(year, month, day, hours, minutes, 0, 0) - offsetMinutes * 60_000;
  return new Date(localMs);
}

/** Returns UTC offset in minutes for a known IANA timezone at runtime. */
function getOffsetMinutes(timezone: string): number {
  // Use Intl.DateTimeFormat to get the UTC offset for the given timezone.
  // We format a known UTC epoch and compute the delta.
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      timeZoneName: "short",
    }).formatToParts(now);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // e.g. "GMT+7" → +420, "GMT-5" → -300
    const match = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const h = parseInt(match[2] ?? "0", 10);
      const m = parseInt(match[3] ?? "0", 10);
      return sign * (h * 60 + m);
    }
  } catch {
    // Fallback to Asia/Ho_Chi_Minh = UTC+7 (420 min)
  }
  return 420;
}

/**
 * Returns the next Date falling on the given weekday (0=Sun…6=Sat) at or after `after`.
 * Result is in UTC but represents midnight local-time of that weekday.
 */
function nextWeekdayAfter(
  weekday: number,
  after: Date,
  offsetMinutes: number,
): { year: number; month: number; day: number } {
  // Convert `after` to local calendar date
  const localMs = after.getTime() + offsetMinutes * 60_000;
  const localDate = new Date(localMs);
  const localYear = localDate.getUTCFullYear();
  const localMonth = localDate.getUTCMonth();
  const localDay = localDate.getUTCDate();
  const localWeekday = localDate.getUTCDay();

  const daysUntil = (weekday - localWeekday + 7) % 7;
  const targetLocal = new Date(
    Date.UTC(localYear, localMonth, localDay + daysUntil),
  );
  return {
    year: targetLocal.getUTCFullYear(),
    month: targetLocal.getUTCMonth(),
    day: targetLocal.getUTCDate(),
  };
}

export type MaterializeResult = {
  created: number;
};

/**
 * Ensure `targetForwardWeeks` future ClubSession occurrences exist for the given series.
 * Idempotent: uses createMany with skipDuplicates based on (seriesId, startTime) uniqueness.
 *
 * @param seriesId  The SessionSeries id.
 * @param targetForwardWeeks  How many future occurrences to maintain (default 8).
 */
export async function materializeSeries(
  seriesId: string,
  targetForwardWeeks = 8,
): Promise<MaterializeResult> {
  const series = await prisma.sessionSeries.findUnique({
    where: { id: seriesId },
  });

  if (!series || series.lifecycleState !== "active") {
    return { created: 0 };
  }

  const now = new Date();

  // Count existing future occurrences that are still active
  const existingCount = await prisma.clubSession.count({
    where: {
      seriesId,
      lifecycleState: { in: ["published", "draft"] },
      startTime: { gt: now },
    },
  });

  if (existingCount >= targetForwardWeeks) {
    return { created: 0 };
  }

  const needed = targetForwardWeeks - existingCount;
  const offsetMinutes = getOffsetMinutes(series.timezone);
  const { hours, minutes } = parseLocalTime(series.startTimeLocal);
  const durationMs = series.durationMin * 60_000;

  // Find the latest future occurrence date to avoid duplicates
  const latestOccurrence = await prisma.clubSession.findFirst({
    where: {
      seriesId,
      lifecycleState: { in: ["published", "draft"] },
      startTime: { gt: now },
    },
    orderBy: { startTime: "desc" },
    select: { startTime: true },
  });

  // Start searching from the day after the latest occurrence, or from now
  let searchFrom = latestOccurrence
    ? new Date(latestOccurrence.startTime.getTime() + 7 * 24 * 60 * 60_000)
    : now;

  const occurrences: {
    appClubId: string;
    hostId: string;
    seriesId: string;
    detachedFromSeries: boolean;
    lifecycleState: string;
    sportId: number | null;
    format: string;
    name: string;
    startTime: Date;
    endTime: Date;
    durationMin: number;
    venueId: number | null;
    venuePending: boolean;
    maxPlayers: number;
    requiresApproval: boolean;
    autoConfirmMode: string;
    privacy: string;
    feeAmount: number | null;
    feeCurrency: string | null;
    skillLevelMin: number | null;
    skillLevelMax: number | null;
    hostRole: string;
    notes: string | null;
  }[] = [];

  // We need the club's host — use the series creator as hostId
  // The club's owner will be fetched from AppClubManager
  const ownerRow = await prisma.appClubManager.findFirst({
    where: { appClubId: series.clubId, role: "OWNER" },
    select: { playerProfileId: true },
  });
  const hostId = ownerRow?.playerProfileId ?? series.createdByUserId;

  for (let i = 0; i < needed; i++) {
    const { year, month, day } = nextWeekdayAfter(
      series.weekday,
      searchFrom,
      offsetMinutes,
    );
    let startTime = localToUtc(year, month, day, hours, minutes, offsetMinutes);

    // Guard: if the computed occurrence is in the past (e.g. today's session already started),
    // advance exactly one week so we never insert a past row.
    if (startTime <= now) {
      startTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60_000);
    }

    const endTime = new Date(startTime.getTime() + durationMs);

    occurrences.push({
      appClubId: series.clubId,
      hostId,
      seriesId,
      detachedFromSeries: false,
      lifecycleState: "published",
      sportId: series.sportId,
      format: series.format,
      name: series.name,
      startTime,
      endTime,
      durationMin: series.durationMin,
      venueId: series.venueId,
      venuePending: series.venuePending,
      maxPlayers: series.maxPlayers,
      requiresApproval: series.requiresApproval,
      autoConfirmMode: series.autoConfirmMode,
      privacy: series.privacy,
      feeAmount: series.feeAmount ? Number(series.feeAmount) : null,
      feeCurrency: series.feeCurrency,
      skillLevelMin: series.skillLevelMin ? Number(series.skillLevelMin) : null,
      skillLevelMax: series.skillLevelMax ? Number(series.skillLevelMax) : null,
      hostRole: series.hostRole,
      notes: series.notes,
    });

    // Advance to one week after this occurrence
    searchFrom = new Date(startTime.getTime() + 7 * 24 * 60 * 60_000);
  }

  if (occurrences.length === 0) return { created: 0 };

  const result = await prisma.clubSession.createMany({
    data: occurrences,
    skipDuplicates: true,
  });

  return { created: result.count };
}
