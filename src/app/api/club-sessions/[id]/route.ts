import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";
import { notifySessionCancelled, notifySessionUpdated } from "@/lib/club-session-notifications";
import { sendPushNotification } from "@/lib/notifications";
import { reclubAvatarUrl } from "@/lib/utils";

/** Material fields — edits to these trigger notifySessionUpdated for all bookings. */
const MATERIAL_FIELDS = new Set([
  "venueId", "venuePending", "startTime", "endTime", "durationMin",
  "feeAmount", "feeCurrency", "skillLevelMin", "skillLevelMax",
]);

/**
 * Fire-and-forget: upsert first_host feed items for each follower of the host
 * and send a push notification to each. Runs only on the first publish.
 */
async function triggerFirstHost(opts: {
  sessionId: string;
  hostProfileId: string;
  venueName: string;
}): Promise<void> {
  const { sessionId, hostProfileId, venueName } = opts;

  // Get host PlayerProfile (prefs + reclubUserId)
  const hostProfile = await prisma.playerProfile.findUnique({
    where: { id: hostProfileId },
    select: { id: true, reclubUserId: true, preferences: true },
  });
  if (!hostProfile?.reclubUserId) return;

  const prefs = (hostProfile.preferences ?? {}) as Record<string, unknown>;
  if (prefs["milestone_first_host"]) return; // Already triggered for this host

  // Confirm this is the first published session for this host
  const publishedCount = await prisma.clubSession.count({
    where: { hostId: hostProfileId, lifecycleState: "published" },
  });
  if (publishedCount !== 1) return;

  // Set flag immediately to prevent re-fire on concurrent requests
  await prisma.playerProfile.update({
    where: { id: hostProfileId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { preferences: { ...prefs, milestone_first_host: true } as any },
  });

  // Get host's Reclub player record (for feed item player payload)
  const hostPlayer = await prisma.player.findUnique({
    where: { userId: hostProfile.reclubUserId },
    select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
  });
  const hostName = hostPlayer?.displayName ?? "Someone in your circle";
  const hostImageUrl = hostPlayer?.imageUrl ?? reclubAvatarUrl(hostProfile.reclubUserId);
  const timestamp = new Date().toISOString();

  // Find all followers of the host
  const follows = await prisma.follow.findMany({
    where: { followeeId: hostProfile.reclubUserId },
    select: { follower: { select: { id: true, pushToken: true, pushTokenIos: true } } },
  });

  for (const { follower } of follows) {
    const feedItemId = `first_host_${sessionId}_${follower.id}`;

    await prisma.feedItem.upsert({
      where: { id: feedItemId },
      create: {
        id: feedItemId,
        profileId: follower.id,
        type: "first_host",
        playerUserId: hostProfile.reclubUserId.toString(),
        payload: {
          id: feedItemId,
          type: "first_host",
          player: {
            userId: hostProfile.reclubUserId.toString(),
            displayName: hostPlayer?.displayName ?? null,
            imageUrl: hostImageUrl,
            duprDoubles: hostPlayer?.duprDoubles ? Number(hostPlayer.duprDoubles) : null,
          },
          venueName,
          sessionId,
          timestamp,
          isFollowing: true,
          kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
        },
        timestamp: new Date(timestamp),
      },
      update: {},
    });

    // Push notification — one per follower per session
    if (!follower.pushToken && !follower.pushTokenIos) continue;

    const dedupType = `first_host:${sessionId}:${follower.id}`;
    const alreadySent = await prisma.notificationSent.findFirst({
      where: { recipientId: follower.id, type: dedupType },
      select: { id: true },
    });
    if (alreadySent) continue;

    const result = await sendPushNotification(follower.id, {
      title: `${hostName} just hosted their first session 🏆`,
      body: "Be the first to show your support!",
      data: {
        type: "first_host",
        screen: "ClubSessions",
        sessionId,
      },
    });
    if (result.success) {
      await prisma.notificationSent.create({
        data: { recipientId: follower.id, type: dedupType },
      });
    }
  }
}

const SESSION_SELECT = {
  id: true,
  appClubId: true,
  hostId: true,
  sportId: true,
  format: true,
  name: true,
  startTime: true,
  endTime: true,
  durationMin: true,
  venueId: true,
  venuePending: true,
  maxPlayers: true,
  requiresApproval: true,
  autoConfirmMode: true,
  privacy: true,
  feeAmount: true,
  feeCurrency: true,
  skillLevelMin: true,
  skillLevelMax: true,
  hostRole: true,
  notes: true,
  lifecycleState: true,
  seriesId: true,
  detachedFromSeries: true,
  autoGrowEnabled: true,
  baseCapacity: true,
  capacityCeiling: true,
  capacityTierStep: true,
  publishAfterMin: true,
  cancellationCutoffMin: true,
  createdAt: true,
  updatedAt: true,
  host: { select: { id: true, displayName: true, squadNickname: true } },
  venue: { select: { id: true, name: true, address: true } },
  appClub: { select: { id: true, name: true, icon: true } },
  _count: { select: { bookings: { where: { status: "confirmed" } } } },
} as const;

// GET /api/club-sessions/[id] — fetch a single session
// Draft sessions are only visible to club managers.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);

  const session = await prisma.clubSession.findUnique({ where: { id }, select: SESSION_SELECT });
  // Deleted sessions are treated as non-existent to all callers
  if (!session || session.lifecycleState === "deleted") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.lifecycleState === "draft") {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const authorized = await isClubManager(session.appClubId, user.profileId);
    if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isManager = user ? await isClubManager(session.appClubId, user.profileId) : false;
  return NextResponse.json({ session, isManager });
}

// PATCH /api/club-sessions/[id] — edit or publish/cancel a session
// Auth: AppClubManager check on session's parent appClubId
//
// Optional scope field:
//   scope?: "THIS_OCCURRENCE" | "ENTIRE_SERIES"
// THIS_OCCURRENCE (default): updates this session + sets detachedFromSeries = true.
// ENTIRE_SERIES: updates this session + series template + all future non-detached occurrences.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.clubSession.findUnique({
    where: { id },
    select: { appClubId: true, lifecycleState: true, seriesId: true, detachedFromSeries: true, name: true },
  });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const authorized = await isClubManager(existing.appClubId, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    name, format, startTime, endTime, durationMin, venueId, venuePending,
    maxPlayers, requiresApproval, autoConfirmMode, privacy, feeAmount, feeCurrency,
    skillLevelMin, skillLevelMax, hostRole, notes, sportId, lifecycleState,
    autoGrowEnabled, baseCapacity, capacityCeiling, capacityTierStep,
    publishAfterMin, cancellationCutoffMin,
    scope,
  } = body as Record<string, unknown>;

  if (scope !== undefined && scope !== "THIS_OCCURRENCE" && scope !== "ENTIRE_SERIES") {
    return NextResponse.json(
      { error: "scope must be 'THIS_OCCURRENCE' or 'ENTIRE_SERIES'" },
      { status: 400 },
    );
  }

  const VALID_AUTO_CONFIRM_MODES = ["open", "auto_confirm_till_full", "requires_approval"];

  const VALID_FORMATS = ["social", "round_robin", "singles"];
  const VALID_HOST_ROLES = ["host_and_play", "host_only"];
  // "deleted" is destructive (removed from all views); "cancelled" stays visible with a banner
  const VALID_LIFECYCLE = ["draft", "published", "cancelled", "deleted"];

  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 1) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (format !== undefined) {
    if (!VALID_FORMATS.includes(format as string)) {
      return NextResponse.json({ error: `format must be one of: ${VALID_FORMATS.join(", ")}` }, { status: 400 });
    }
    updates.format = format;
  }
  if (startTime !== undefined) {
    const d = new Date(startTime as string);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid startTime" }, { status: 400 });
    updates.startTime = d;
  }
  if (endTime !== undefined) {
    const d = new Date(endTime as string);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid endTime" }, { status: 400 });
    updates.endTime = d;
  }
  if (durationMin !== undefined) updates.durationMin = durationMin;
  if (venueId !== undefined) updates.venueId = typeof venueId === "number" ? venueId : null;
  if (venuePending !== undefined) updates.venuePending = venuePending === true;
  if (maxPlayers !== undefined) {
    if (typeof maxPlayers !== "number" || maxPlayers < 1) {
      return NextResponse.json({ error: "maxPlayers must be a positive integer" }, { status: 400 });
    }
    updates.maxPlayers = maxPlayers;
  }
  if (autoConfirmMode !== undefined) {
    if (!VALID_AUTO_CONFIRM_MODES.includes(autoConfirmMode as string)) {
      return NextResponse.json({ error: `autoConfirmMode must be one of: ${VALID_AUTO_CONFIRM_MODES.join(", ")}` }, { status: 400 });
    }
    updates.autoConfirmMode = autoConfirmMode;
    // Keep requiresApproval in sync for backward compat
    updates.requiresApproval = autoConfirmMode === "requires_approval";
  } else if (requiresApproval !== undefined) {
    updates.requiresApproval = requiresApproval === true;
    // Sync autoConfirmMode if only the legacy boolean is sent
    updates.autoConfirmMode = requiresApproval === true ? "requires_approval" : "open";
  }
  if (privacy !== undefined && (privacy === "public" || privacy === "private")) updates.privacy = privacy;
  if (feeAmount !== undefined) updates.feeAmount = typeof feeAmount === "number" ? feeAmount : null;
  if (feeCurrency !== undefined) updates.feeCurrency = typeof feeCurrency === "string" ? feeCurrency : null;
  if (skillLevelMin !== undefined) updates.skillLevelMin = typeof skillLevelMin === "number" ? skillLevelMin : null;
  if (skillLevelMax !== undefined) updates.skillLevelMax = typeof skillLevelMax === "number" ? skillLevelMax : null;
  if (hostRole !== undefined && VALID_HOST_ROLES.includes(hostRole as string)) updates.hostRole = hostRole;
  if (notes !== undefined) updates.notes = typeof notes === "string" ? notes : null;
  if (sportId !== undefined) updates.sportId = typeof sportId === "number" ? sportId : null;

  // Auto-grow fields
  if (autoGrowEnabled !== undefined) {
    updates.autoGrowEnabled = autoGrowEnabled === true;
    if (!autoGrowEnabled) {
      // Clearing auto-grow: also null out the grow-specific fields
      updates.baseCapacity = null;
      updates.capacityCeiling = null;
    }
  }
  if (baseCapacity !== undefined) {
    updates.baseCapacity = typeof baseCapacity === "number" && baseCapacity > 0 ? baseCapacity : null;
  }
  if (capacityCeiling !== undefined) {
    updates.capacityCeiling = typeof capacityCeiling === "number" && capacityCeiling > 0 ? capacityCeiling : null;
  }
  if (capacityTierStep !== undefined && typeof capacityTierStep === "number" && capacityTierStep > 0) {
    updates.capacityTierStep = capacityTierStep;
  }

  if (publishAfterMin !== undefined) {
    updates.publishAfterMin = typeof publishAfterMin === "number" && publishAfterMin > 0 ? publishAfterMin : null;
  }
  if (cancellationCutoffMin !== undefined) {
    updates.cancellationCutoffMin = typeof cancellationCutoffMin === "number" && cancellationCutoffMin > 0 ? cancellationCutoffMin : null;
  }

  if (lifecycleState !== undefined) {
    if (!VALID_LIFECYCLE.includes(lifecycleState as string)) {
      return NextResponse.json({ error: `lifecycleState must be one of: ${VALID_LIFECYCLE.join(", ")}` }, { status: 400 });
    }
    updates.lifecycleState = lifecycleState;
  }

  // Guard: fire notifications when transitioning to cancelled OR deleted
  const isBeingCancelled =
    (lifecycleState === "cancelled" || lifecycleState === "deleted") &&
    existing.lifecycleState !== "cancelled" &&
    existing.lifecycleState !== "deleted";

  // Guard: first_host trigger on draft → published transition
  const isBeingPublished =
    lifecycleState === "published" &&
    existing.lifecycleState !== "published";

  // Detect whether any material field is being changed
  const materialFieldsChanged = Object.keys(updates).some((k) => MATERIAL_FIELDS.has(k));

  try {
    // ── ENTIRE_SERIES scope ────────────────────────────────────────────────────
    if (scope === "ENTIRE_SERIES" && existing.seriesId) {
      const now = new Date();

      // Build series-template update (only the fields SessionSeries carries)
      const SERIES_FIELDS = new Set([
        "venueId", "venuePending", "durationMin", "feeAmount", "feeCurrency",
        "skillLevelMin", "skillLevelMax", "name", "format", "hostRole", "notes",
        "maxPlayers", "requiresApproval", "autoConfirmMode", "privacy", "sportId",
      ]);
      const seriesUpdates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (SERIES_FIELDS.has(k)) seriesUpdates[k] = v;
      }
      // startTimeLocal is derived from startTime if provided
      if (updates.startTime instanceof Date) {
        const series = await prisma.sessionSeries.findUnique({
          where: { id: existing.seriesId },
          select: { timezone: true },
        });
        if (series) {
          seriesUpdates.startTimeLocal = (updates.startTime as Date).toLocaleTimeString("en-GB", {
            timeZone: series.timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        }
      }

      // 1. Update this session
      const session = await prisma.clubSession.update({
        where: { id },
        data: updates,
        select: SESSION_SELECT,
      });

      // 2. Update series template
      if (Object.keys(seriesUpdates).length > 0) {
        await prisma.sessionSeries.update({
          where: { id: existing.seriesId },
          data: seriesUpdates,
        });
      }

      // 3. Update future non-detached occurrences (exclude current session — already updated)
      const futureNonDetached = await prisma.clubSession.findMany({
        where: {
          seriesId: existing.seriesId,
          detachedFromSeries: false,
          lifecycleState: { in: ["published", "draft"] },
          startTime: { gt: now },
          id: { not: id },
        },
        select: { id: true, name: true },
      });

      if (futureNonDetached.length > 0) {
        // Build per-occurrence update — exclude startTime/endTime (each occurrence has its own)
        const occurrenceUpdates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (k !== "startTime" && k !== "endTime" && k !== "lifecycleState") {
            occurrenceUpdates[k] = v;
          }
        }
        if (Object.keys(occurrenceUpdates).length > 0) {
          await prisma.clubSession.updateMany({
            where: {
              id: { in: futureNonDetached.map((s) => s.id) },
            },
            data: occurrenceUpdates,
          });
        }

        // Notify each affected occurrence if material fields changed
        if (materialFieldsChanged) {
          for (const occ of [{ id, name: session.name }, ...futureNonDetached]) {
            void notifySessionUpdated({
              sessionId: occ.id,
              sessionName: occ.name,
              hostProfileId: user.profileId,
            });
          }
        }
      } else if (materialFieldsChanged) {
        void notifySessionUpdated({
          sessionId: id,
          sessionName: session.name,
          hostProfileId: user.profileId,
        });
      }

      if (isBeingPublished) {
        const venueName = session.venue?.name ?? session.appClub?.name ?? "their venue";
        void triggerFirstHost({ sessionId: id, hostProfileId: session.host.id, venueName });
      }

      return NextResponse.json({ ok: true, session, scope: "ENTIRE_SERIES" });
    }

    // ── THIS_OCCURRENCE (default) ─────────────────────────────────────────────
    // When this occurrence belongs to a series and isn't already detached,
    // mark it as detached so future series-wide ops skip it.
    if (existing.seriesId && !existing.detachedFromSeries && scope !== undefined) {
      updates.detachedFromSeries = true;
    }

    const session = await prisma.clubSession.update({
      where: { id },
      data: updates,
      select: SESSION_SELECT,
    });

    if (isBeingCancelled) {
      void notifySessionCancelled({
        sessionId: id,
        sessionName: existing.lifecycleState !== "cancelled" ? session.name : "",
        hostProfileId: user.profileId,
      });
    } else if (materialFieldsChanged) {
      void notifySessionUpdated({
        sessionId: id,
        sessionName: session.name,
        hostProfileId: user.profileId,
      });
    }

    if (isBeingPublished) {
      const venueName = session.venue?.name ?? session.appClub?.name ?? "their venue";
      void triggerFirstHost({
        sessionId: id,
        hostProfileId: session.host.id,
        venueName,
      });
    }
    return NextResponse.json({ ok: true, session });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") return NextResponse.json({ error: "Session not found" }, { status: 404 });
    console.error("[PATCH /api/club-sessions/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/club-sessions/[id] — hard-cancel a session (sets lifecycleState to "cancelled")
// Auth: AppClubManager check
// Note: actual notification firing on cancel is handled in Phase 3.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.clubSession.findUnique({
    where: { id },
    select: { appClubId: true, lifecycleState: true, name: true },
  });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (existing.lifecycleState === "cancelled") {
    return NextResponse.json({ error: "Session is already cancelled" }, { status: 409 });
  }

  const authorized = await isClubManager(existing.appClubId, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const session = await prisma.clubSession.update({
    where: { id },
    data: { lifecycleState: "cancelled" },
    select: SESSION_SELECT,
  });

  // Notify all confirmed + waiting_list players (row 6 of spec §4 notification matrix)
  void notifySessionCancelled({
    sessionId: id,
    sessionName: existing.name,
    hostProfileId: user.profileId,
  });

  return NextResponse.json({ ok: true, session });
}
