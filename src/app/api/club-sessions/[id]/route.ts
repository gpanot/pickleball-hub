import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";
import { notifySessionCancelled } from "@/lib/club-session-notifications";

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
  privacy: true,
  feeAmount: true,
  feeCurrency: true,
  skillLevelMin: true,
  skillLevelMax: true,
  hostRole: true,
  notes: true,
  lifecycleState: true,
  createdAt: true,
  updatedAt: true,
  host: { select: { id: true, displayName: true, squadNickname: true } },
  venue: { select: { id: true, name: true, address: true } },
  appClub: { select: { id: true, name: true, icon: true } },
  _count: { select: { bookings: true } },
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

  return NextResponse.json({ session });
}

// PATCH /api/club-sessions/[id] — edit or publish/cancel a session
// Auth: AppClubManager check on session's parent appClubId
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.clubSession.findUnique({
    where: { id },
    select: { appClubId: true, lifecycleState: true },
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
    maxPlayers, requiresApproval, privacy, feeAmount, feeCurrency,
    skillLevelMin, skillLevelMax, hostRole, notes, sportId, lifecycleState,
  } = body as Record<string, unknown>;

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
  if (requiresApproval !== undefined) updates.requiresApproval = requiresApproval === true;
  if (privacy !== undefined && (privacy === "public" || privacy === "private")) updates.privacy = privacy;
  if (feeAmount !== undefined) updates.feeAmount = typeof feeAmount === "number" ? feeAmount : null;
  if (feeCurrency !== undefined) updates.feeCurrency = typeof feeCurrency === "string" ? feeCurrency : null;
  if (skillLevelMin !== undefined) updates.skillLevelMin = typeof skillLevelMin === "number" ? skillLevelMin : null;
  if (skillLevelMax !== undefined) updates.skillLevelMax = typeof skillLevelMax === "number" ? skillLevelMax : null;
  if (hostRole !== undefined && VALID_HOST_ROLES.includes(hostRole as string)) updates.hostRole = hostRole;
  if (notes !== undefined) updates.notes = typeof notes === "string" ? notes : null;
  if (sportId !== undefined) updates.sportId = typeof sportId === "number" ? sportId : null;
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

  try {
    const session = await prisma.clubSession.update({
      where: { id },
      data: updates,
      select: SESSION_SELECT,
    });
    if (isBeingCancelled) {
      void notifySessionCancelled({
        sessionId: id,
        sessionName: existing.lifecycleState !== "cancelled"
          ? session.name
          : "",
        hostProfileId: user.profileId,
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
