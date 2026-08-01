/**
 * PATCH  /api/logbook/[id]  — update own entry (partial)
 * DELETE /api/logbook/[id]  — delete own entry
 *
 * Auth: mobile JWT (Bearer) via getMobileUser.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

const VALID_SPORTS = new Set(["pickleball", "padel"]);
const VALID_SESSION_TYPES = new Set(["training", "social", "class"]);
const VALID_LOCATIONS = new Set(["single", "double"]);

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.logbookEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.profileId !== user.profileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Build partial update — only fields present in body are changed
  const updates: Record<string, unknown> = {};

  if (body.sportId !== undefined) {
    if (typeof body.sportId !== "string" || !VALID_SPORTS.has(body.sportId)) {
      return NextResponse.json(
        { error: "sportId must be 'pickleball' or 'padel'" },
        { status: 400 }
      );
    }
    updates.sportId = body.sportId;
  }
  if (body.date !== undefined) {
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    updates.date = body.date;
  }
  if (body.hours !== undefined) {
    if (typeof body.hours !== "number" || body.hours < 0.5 || body.hours > 8) {
      return NextResponse.json(
        { error: "hours must be between 0.5 and 8" },
        { status: 400 }
      );
    }
    updates.hours = body.hours;
  }
  if (body.sessionType !== undefined) {
    if (
      typeof body.sessionType !== "string" ||
      !VALID_SESSION_TYPES.has(body.sessionType)
    ) {
      return NextResponse.json(
        { error: "sessionType must be 'training', 'social', or 'class'" },
        { status: 400 }
      );
    }
    updates.sessionType = body.sessionType;
  }
  if (body.location !== undefined) {
    if (typeof body.location !== "string" || !VALID_LOCATIONS.has(body.location)) {
      return NextResponse.json(
        { error: "location must be 'single' or 'double'" },
        { status: 400 }
      );
    }
    updates.location = body.location;
  }
  if (body.trainingFocus !== undefined) {
    if (
      !Array.isArray(body.trainingFocus) ||
      body.trainingFocus.some((x) => typeof x !== "string")
    ) {
      return NextResponse.json(
        { error: "trainingFocus must be an array of strings" },
        { status: 400 }
      );
    }
    updates.trainingFocus = body.trainingFocus;
  }
  if (body.difficulty !== undefined) {
    if (
      !Array.isArray(body.difficulty) ||
      body.difficulty.some((x) => typeof x !== "string")
    ) {
      return NextResponse.json(
        { error: "difficulty must be an array of strings" },
        { status: 400 }
      );
    }
    updates.difficulty = body.difficulty;
  }
  if (body.feeling !== undefined) {
    if (
      typeof body.feeling !== "number" ||
      !Number.isInteger(body.feeling) ||
      body.feeling < 1 ||
      body.feeling > 5
    ) {
      return NextResponse.json(
        { error: "feeling must be an integer 1..5" },
        { status: 400 }
      );
    }
    updates.feeling = body.feeling;
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "notes must be a string or null" }, { status: 400 });
    }
    if (typeof body.notes === "string" && body.notes.length > 2000) {
      return NextResponse.json(
        { error: "notes must not exceed 2000 characters" },
        { status: 400 }
      );
    }
    updates.notes = body.notes ?? null;
  }
  if (body.exerciseDetails !== undefined) {
    updates.exerciseDetails = body.exerciseDetails ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.logbookEntry.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: updates as any,
  });

  // If sport changed, sync preference (fire-and-forget)
  if (typeof updates.sportId === "string") {
    void syncLogbookSportPref(user.profileId, updates.sportId);
  }

  console.log(`[PATCH /api/logbook/${id}] profileId=${user.profileId}`);

  return NextResponse.json({ entry: updated });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.logbookEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.profileId !== user.profileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.logbookEntry.delete({ where: { id } });

  console.log(`[DELETE /api/logbook/${id}] profileId=${user.profileId}`);

  return NextResponse.json({ ok: true });
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function syncLogbookSportPref(profileId: string, sportId: string) {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: profileId },
      select: { preferences: true },
    });
    if (!profile) return;
    const existing =
      profile.preferences && typeof profile.preferences === "object"
        ? (profile.preferences as Record<string, unknown>)
        : {};
    if (existing.logbookSportId === sportId) return;
    await prisma.playerProfile.update({
      where: { id: profileId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { preferences: { ...existing, logbookSportId: sportId } as any },
    });
  } catch {
    // Non-fatal
  }
}
