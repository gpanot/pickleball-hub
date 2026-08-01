/**
 * GET  /api/logbook  — list caller's entries, newest first
 * POST /api/logbook  — create a new entry
 *
 * Auth: mobile JWT (Bearer) via getMobileUser.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

const VALID_SPORTS = new Set(["pickleball", "padel"]);
const VALID_SESSION_TYPES = new Set(["training", "social", "class"]);
const VALID_LOCATIONS = new Set(["single", "double"]);

function parseSkillArray(v: unknown, field: string) {
  if (!Array.isArray(v)) {
    return { error: `${field} must be an array` };
  }
  if (v.some((x) => typeof x !== "string")) {
    return { error: `${field} must be an array of strings` };
  }
  return { value: v as string[] };
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.logbookEntry.findMany({
    where: { profileId: user.profileId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ entries });
}

// ── POST ─────────────────────────────────────────────────────────────────────

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
    sportId,
    date,
    hours,
    sessionType,
    location,
    trainingFocus,
    difficulty,
    feeling,
    notes,
    exerciseDetails,
  } = body;

  // ── validation ──────────────────────────────────────────────────────────────
  if (typeof sportId !== "string" || !VALID_SPORTS.has(sportId)) {
    return NextResponse.json(
      { error: "sportId must be 'pickleball' or 'padel'" },
      { status: 400 }
    );
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (typeof hours !== "number" || hours < 0.5 || hours > 8) {
    return NextResponse.json(
      { error: "hours must be between 0.5 and 8" },
      { status: 400 }
    );
  }
  if (typeof sessionType !== "string" || !VALID_SESSION_TYPES.has(sessionType)) {
    return NextResponse.json(
      { error: "sessionType must be 'training', 'social', or 'class'" },
      { status: 400 }
    );
  }
  if (typeof location !== "string" || !VALID_LOCATIONS.has(location)) {
    return NextResponse.json(
      { error: "location must be 'single' or 'double'" },
      { status: 400 }
    );
  }
  const tfResult = parseSkillArray(trainingFocus, "trainingFocus");
  if (tfResult.error) return NextResponse.json({ error: tfResult.error }, { status: 400 });

  const diffResult = parseSkillArray(difficulty, "difficulty");
  if (diffResult.error) return NextResponse.json({ error: diffResult.error }, { status: 400 });

  if (typeof feeling !== "number" || !Number.isInteger(feeling) || feeling < 1 || feeling > 5) {
    return NextResponse.json(
      { error: "feeling must be an integer 1..5" },
      { status: 400 }
    );
  }
  if (notes !== undefined && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
  }
  if (typeof notes === "string" && notes.length > 2000) {
    return NextResponse.json(
      { error: "notes must not exceed 2000 characters" },
      { status: 400 }
    );
  }

  // ── create entry ─────────────────────────────────────────────────────────────
  const entry = await prisma.logbookEntry.create({
    data: {
      profileId: user.profileId,
      sportId: sportId as string,
      date: date as string,
      hours: hours as number,
      sessionType: sessionType as string,
      location: location as string,
      trainingFocus: tfResult.value!,
      difficulty: diffResult.value!,
      feeling: feeling as number,
      notes: typeof notes === "string" ? notes : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exerciseDetails: (exerciseDetails ?? null) as any,
    },
  });

  // Sync sport preference (fire-and-forget — non-fatal if it fails)
  void syncLogbookSportPref(user.profileId, sportId as string);

  console.log(
    `[POST /api/logbook] profileId=${user.profileId} sport=${sportId} date=${date}`
  );

  return NextResponse.json({ entry }, { status: 201 });
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
    if (existing.logbookSportId === sportId) return; // already in sync
    await prisma.playerProfile.update({
      where: { id: profileId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { preferences: { ...existing, logbookSportId: sportId } as any },
    });
  } catch {
    // Non-fatal — preference sync failure should not break entry creation
  }
}
