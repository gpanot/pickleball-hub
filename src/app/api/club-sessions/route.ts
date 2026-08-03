import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/squad-geo";
import { materializeSeries } from "@/lib/club-sessions/materialize-series";

const VALID_FORMATS = ["social", "round_robin", "singles"] as const;
const VALID_HOST_ROLES = ["host_and_play", "host_only"] as const;

// POST /api/club-sessions — create a session under an AppClub
// Auth: AppClubManager check on the target appClubId
//
// Optional repeat field for weekly recurring series:
//   repeat?: { pattern: "weekly"; weekday: 0–6; timezone: string }
// When present, creates a SessionSeries and materializes 8 occurrences.
// Returns the first occurrence's session row.
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    appClubId, name, format, startTime, endTime, durationMin,
    venueId, venuePending, maxPlayers, requiresApproval, autoConfirmMode, privacy,
    feeAmount, feeCurrency, skillLevelMin, skillLevelMax,
    hostRole, notes, sportId,
    autoGrowEnabled, baseCapacity, capacityCeiling, capacityTierStep,
    publishAfterMin, cancellationCutoffMin,
    repeat,
  } = body as Record<string, unknown>;

  const VALID_AUTO_CONFIRM_MODES = ["open", "auto_confirm_till_full", "requires_approval"];
  // Derive canonical mode: explicit field wins; fall back to requiresApproval bool for backward compat
  const resolvedAutoConfirmMode = (
    typeof autoConfirmMode === "string" && VALID_AUTO_CONFIRM_MODES.includes(autoConfirmMode)
      ? autoConfirmMode
      : requiresApproval === true
      ? "requires_approval"
      : "open"
  ) as string;

  if (!appClubId || typeof appClubId !== "string") {
    return NextResponse.json({ error: "appClubId required" }, { status: 400 });
  }

  // Auth: caller must be a manager of the target club
  const authorized = await isClubManager(appClubId, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!name || typeof name !== "string" || name.trim().length < 1) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!format || !VALID_FORMATS.includes(format as typeof VALID_FORMATS[number])) {
    return NextResponse.json({ error: `format must be one of: ${VALID_FORMATS.join(", ")}` }, { status: 400 });
  }
  if (!startTime || !endTime) {
    return NextResponse.json({ error: "startTime and endTime required" }, { status: 400 });
  }
  const start = new Date(startTime as string);
  const end = new Date(endTime as string);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "startTime and endTime must be valid ISO dates" }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
  }
  const dur = typeof durationMin === "number" ? durationMin : Math.round((end.getTime() - start.getTime()) / 60000);
  if (!maxPlayers || typeof maxPlayers !== "number" || maxPlayers < 1) {
    return NextResponse.json({ error: "maxPlayers must be a positive integer" }, { status: 400 });
  }

  // Validate repeat field if present
  const repeatObj = repeat && typeof repeat === "object" ? (repeat as Record<string, unknown>) : null;
  const isWeeklyRepeat =
    repeatObj !== null &&
    repeatObj.pattern === "weekly" &&
    typeof repeatObj.weekday === "number" &&
    repeatObj.weekday >= 0 &&
    repeatObj.weekday <= 6 &&
    typeof repeatObj.timezone === "string";

  if (repeatObj && !isWeeklyRepeat) {
    return NextResponse.json(
      { error: "repeat must be { pattern: 'weekly', weekday: 0-6, timezone: string }" },
      { status: 400 },
    );
  }

  const resolvedHostRole = VALID_HOST_ROLES.includes(hostRole as typeof VALID_HOST_ROLES[number])
    ? (hostRole as string)
    : "host_and_play";

  const baseSessionPayload = {
    appClubId,
    hostId: user.profileId,
    sportId: typeof sportId === "number" ? sportId : null,
    format: format as string,
    name: (name as string).trim(),
    startTime: start,
    endTime: end,
    durationMin: dur,
    venueId: typeof venueId === "number" ? venueId : null,
    venuePending: venuePending === true,
    maxPlayers: maxPlayers as number,
    requiresApproval: resolvedAutoConfirmMode === "requires_approval",
    autoConfirmMode: resolvedAutoConfirmMode,
    privacy: privacy === "private" ? "private" : "public",
    feeAmount: typeof feeAmount === "number" ? feeAmount : null,
    feeCurrency: typeof feeCurrency === "string" ? feeCurrency : null,
    skillLevelMin: typeof skillLevelMin === "number" ? skillLevelMin : null,
    skillLevelMax: typeof skillLevelMax === "number" ? skillLevelMax : null,
    hostRole: resolvedHostRole,
    notes: typeof notes === "string" ? notes : null,
    autoGrowEnabled: autoGrowEnabled === true,
    baseCapacity: autoGrowEnabled === true && typeof baseCapacity === "number" && baseCapacity > 0 ? baseCapacity : null,
    capacityCeiling: autoGrowEnabled === true && typeof capacityCeiling === "number" && capacityCeiling > 0 ? capacityCeiling : null,
    capacityTierStep: typeof capacityTierStep === "number" && capacityTierStep > 0 ? capacityTierStep : 4,
    publishAfterMin: typeof publishAfterMin === "number" && publishAfterMin > 0 ? publishAfterMin : null,
    cancellationCutoffMin: typeof cancellationCutoffMin === "number" && cancellationCutoffMin > 0 ? cancellationCutoffMin : null,
  };

  // ── Weekly recurring series path ────────────────────────────────────────────
  if (isWeeklyRepeat && repeatObj) {
    const repeatWeekday = repeatObj.weekday as number;
    const repeatTimezone = repeatObj.timezone as string;
    // Derive "HH:MM" from the provided startTime in the given timezone
    const startTimeLocal = start.toLocaleTimeString("en-GB", {
      timeZone: repeatTimezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    try {
      const series = await prisma.sessionSeries.create({
        data: {
          clubId: appClubId,
          createdByUserId: user.profileId,
          weekday: repeatWeekday,
          startTimeLocal,
          durationMin: dur,
          timezone: repeatTimezone,
          sportId: typeof sportId === "number" ? sportId : null,
          format: format as string,
          hostRole: resolvedHostRole,
          name: (name as string).trim(),
          venueId: typeof venueId === "number" ? venueId : null,
          venuePending: venuePending === true,
          maxPlayers: maxPlayers as number,
          requiresApproval: resolvedAutoConfirmMode === "requires_approval",
          autoConfirmMode: resolvedAutoConfirmMode,
          privacy: privacy === "private" ? "private" : "public",
          feeAmount: typeof feeAmount === "number" ? feeAmount : null,
          feeCurrency: typeof feeCurrency === "string" ? feeCurrency : null,
          skillLevelMin: typeof skillLevelMin === "number" ? skillLevelMin : null,
          skillLevelMax: typeof skillLevelMax === "number" ? skillLevelMax : null,
          notes: typeof notes === "string" ? notes : null,
          lifecycleState: "active",
        },
      });

      await materializeSeries(series.id, 8);

      // Return the first occurrence (earliest startTime)
      const firstOccurrence = await prisma.clubSession.findFirst({
        where: { seriesId: series.id, lifecycleState: "published" },
        orderBy: { startTime: "asc" },
        include: {
          host: { select: { id: true, displayName: true, squadNickname: true } },
          venue: { select: { id: true, name: true, address: true } },
          _count: { select: { bookings: { where: { status: "confirmed" } } } },
        },
      });

      return NextResponse.json({ ok: true, session: firstOccurrence, seriesId: series.id }, { status: 201 });
    } catch (err) {
      const e = err as Error & { code?: string; meta?: unknown };
      console.error("[POST /api/club-sessions] series creation error:", {
        message: e.message, code: e.code, meta: e.meta,
      });
      return NextResponse.json({ error: e.message ?? "Internal server error" }, { status: 500 });
    }
  }

  // ── One-off session path (existing behavior) ────────────────────────────────
  const dbPayload = { ...baseSessionPayload, lifecycleState: "draft" };

  console.log("[POST /api/club-sessions] dbPayload:", JSON.stringify(dbPayload));

  try {
    const session = await prisma.clubSession.create({
      data: dbPayload,
      include: {
        host: { select: { id: true, displayName: true, squadNickname: true } },
        venue: { select: { id: true, name: true, address: true } },
        _count: { select: { bookings: { where: { status: "confirmed" } } } },
      },
    });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (err) {
    const e = err as Error & { code?: string; meta?: unknown };
    console.error("[POST /api/club-sessions] Prisma error:", {
      message: e.message,
      code: e.code,
      meta: e.meta,
      stack: e.stack,
    });
    const detail = e.code ? `DB error ${e.code}: ${e.message}` : e.message ?? "Internal server error";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

// GET /api/club-sessions — list sessions with filters
// Auth: none required for public sessions; draft sessions only visible to managers
// Query params: appClubId, seriesId, timeframe (upcoming|past|all), lifecycleState, take, cursor
//               lat, lng, radiusKm — filter sessions by distance from caller's location
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  const { searchParams } = req.nextUrl;
  const appClubId = searchParams.get("appClubId") ?? undefined;
  const seriesIdFilter = searchParams.get("seriesId") ?? undefined;
  const timeframe = searchParams.get("timeframe") ?? "upcoming"; // upcoming | past | all
  const take = Math.min(Number(searchParams.get("take") ?? "20"), 50);
  const cursor = searchParams.get("cursor") ?? undefined;

  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const radiusKm = parseFloat(searchParams.get("radiusKm") ?? "");
  const hasGeoFilter = Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radiusKm) && radiusKm > 0;

  const now = new Date();

  // Draft sessions are only visible to the session's club managers
  const canSeeDrafts = user
    ? (appClubId ? await isClubManager(appClubId, user.profileId) : false)
    : false;

  // "deleted" sessions are always excluded from all listing queries.
  // Public browse shows published + cancelled (players see cancelled sessions with a badge).
  // Club managers also see drafts on club-scoped queries.
  // Series overview needs all lifecycleStates — bypass when seriesId is specified.
  const lifecycleFilter = seriesIdFilter
    ? {} // Series Overview shows all states for that series
    : canSeeDrafts
    ? { lifecycleState: { in: ["published", "draft", "cancelled"] } }
    : { lifecycleState: { in: ["published", "cancelled"] } };

  // "upcoming" = session has not yet ended: endTime > now
  // endTime = startTime + durationMin (default 60 min).
  // Using a raw filter via startTime gte (now - maxDuration) + post-filter is complex,
  // so we shift the cutoff back by a generous 4 hours so that any session that could
  // still be running is included, then let the client drop truly-ended ones.
  // For "past" we keep startTime < now (server-side) and let the client add ended-today.
  const ONGOING_GRACE_MS = 4 * 60 * 60 * 1000; // 4 h — covers any realistic session length
  const upcomingCutoff = new Date(now.getTime() - ONGOING_GRACE_MS);
  const timeFilter =
    seriesIdFilter
      ? {} // Series Overview shows past + future
      : timeframe === "upcoming"
      ? { startTime: { gte: upcomingCutoff } }
      : timeframe === "past"
      ? { startTime: { lt: upcomingCutoff } }
      : {};

  const sessions = await prisma.clubSession.findMany({
    where: {
      ...(seriesIdFilter ? { seriesId: seriesIdFilter } : appClubId ? { appClubId } : { privacy: "public" }),
      ...lifecycleFilter,
      ...timeFilter,
    },
    select: {
      id: true,
      appClubId: true,
      name: true,
      format: true,
      startTime: true,
      endTime: true,
      durationMin: true,
      maxPlayers: true,
      requiresApproval: true,
      autoConfirmMode: true,
      privacy: true,
      feeAmount: true,
      feeCurrency: true,
      skillLevelMin: true,
      skillLevelMax: true,
      lifecycleState: true,
      venuePending: true,
      notes: true,
      autoGrowEnabled: true,
      baseCapacity: true,
      capacityCeiling: true,
      capacityTierStep: true,
      publishAfterMin: true,
      cancellationCutoffMin: true,
      seriesId: true,
      detachedFromSeries: true,
      createdAt: true,
      host: { select: { id: true, displayName: true, squadNickname: true } },
      venue: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      sportId: true,
      appClub: { select: { id: true, name: true, icon: true, sportId: true } },
      bookings: {
        where: { status: "confirmed" },
        take: 8,
        orderBy: { requestedAt: "asc" },
        select: {
          player: {
            select: {
              id: true,
              displayName: true,
              squadNickname: true,
              preferences: true,
              user: { select: { image: true } },
            },
          },
        },
      },
      _count: { select: { bookings: { where: { status: "confirmed" } } } },
    },
    orderBy: timeframe === "past" ? { startTime: "desc" } : { startTime: "asc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  // Apply optional geo filter (sessions with no venue coords are always included)
  const filteredSessions = hasGeoFilter
    ? sessions.filter((s) => {
        const vLat = s.venue?.latitude;
        const vLng = s.venue?.longitude;
        if (vLat == null || vLng == null) return true; // venuePending or no coords — keep
        return haversineKm(lat, lng, vLat, vLng) <= radiusKm;
      })
    : sessions;

  const nextCursor = sessions.length === take ? sessions[sessions.length - 1].id : null;
  return NextResponse.json({ sessions: filteredSessions, nextCursor });
}
