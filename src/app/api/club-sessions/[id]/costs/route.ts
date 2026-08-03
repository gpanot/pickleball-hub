/**
 * GET  /api/club-sessions/[id]/costs — list all cost rows for a session.
 * POST /api/club-sessions/[id]/costs — full replace: delete all existing rows,
 *   then insert every entry with amount > 0.
 *
 * Auth: any manager of the club that owns this session (isAnyManager).
 *
 * POST body:
 *   { costs: Array<{ category: string; amount: number; currency: string; notes?: string }> }
 *
 * Rows with amount === 0 are silently ignored (not inserted).
 * Category can be any non-empty slug (max 64 chars, word chars + hyphens).
 *
 * Returns: { costs: ClubSessionCost[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isAnyManager } from "@/lib/club-permissions";
import { getSessionClubId } from "@/lib/club-auth";
import { prisma } from "@/lib/db";

function isValidCategory(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[\w-]+$/.test(value)
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clubId = await getSessionClubId(sessionId);
  if (!clubId) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const authorized = await isAnyManager(user.profileId, clubId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const costs = await prisma.clubSessionCost.findMany({
    where: { sessionId },
    orderBy: { category: "asc" },
    select: { category: true, amount: true, currency: true, notes: true },
  });

  return NextResponse.json({ costs });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clubId = await getSessionClubId(sessionId);
  if (!clubId) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const authorized = await isAnyManager(user.profileId, clubId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { costs?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.costs)) {
    return NextResponse.json({ error: "costs must be an array" }, { status: 400 });
  }

  // Build validated rows to insert (amount > 0 only)
  const toInsert: {
    sessionId: string;
    category: string;
    amount: number;
    currency: string;
    notes: string | null;
  }[] = [];

  for (const entry of body.costs) {
    const e = entry as { category?: unknown; amount?: unknown; currency?: unknown; notes?: unknown };
    if (!isValidCategory(e.category)) continue;
    const amount = Number(e.amount ?? 0);
    if (amount <= 0) continue;
    toInsert.push({
      sessionId,
      category: e.category,
      amount,
      currency: typeof e.currency === "string" ? e.currency : "VND",
      notes: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim() : null,
    });
  }

  // Full replace inside a transaction: delete all, then insert current state
  await prisma.$transaction(async (tx) => {
    await tx.clubSessionCost.deleteMany({ where: { sessionId } });
    if (toInsert.length > 0) {
      await tx.clubSessionCost.createMany({ data: toInsert });
    }
  });

  const costs = await prisma.clubSessionCost.findMany({
    where: { sessionId },
    orderBy: { category: "asc" },
    select: { category: true, amount: true, currency: true, notes: true },
  });

  return NextResponse.json({ costs });
}
