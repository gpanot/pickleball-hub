/**
 * GET  /api/club-sessions/[id]/costs — list all cost rows for a session.
 * POST /api/club-sessions/[id]/costs — upsert/delete cost entries.
 *
 * Auth: any manager of the club that owns this session (isAnyManager).
 *
 * POST body:
 *   { costs: Array<{ category: string; amount: number; currency: string; notes?: string }> }
 *
 * POST behaviour per entry:
 *   amount > 0  → upsert by (sessionId, category)
 *   amount === 0 → delete existing row for that category (no-op if none exists)
 *
 * Returns: { costs: ClubSessionCost[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isAnyManager } from "@/lib/club-permissions";
import { getSessionClubId } from "@/lib/club-auth";
import { prisma } from "@/lib/db";

const VALID_CATEGORIES = ["court_rental", "balls", "coach_fee", "other"] as const;
type Category = typeof VALID_CATEGORIES[number];

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

  // Process each entry inside a transaction
  await prisma.$transaction(async (tx) => {
    for (const entry of body.costs!) {
      const e = entry as { category?: unknown; amount?: unknown; currency?: unknown; notes?: unknown };
      const category = e.category as Category;
      if (!VALID_CATEGORIES.includes(category)) continue;

      const amount = Number(e.amount ?? 0);
      const currency = typeof e.currency === "string" ? e.currency : "VND";
      const notes = typeof e.notes === "string" ? e.notes : null;

      if (amount > 0) {
        await tx.clubSessionCost.upsert({
          where: { sessionId_category: { sessionId, category } },
          create: { sessionId, category, amount, currency, notes },
          update: { amount, currency, notes },
        });
      } else {
        // Zero → delete if exists
        await tx.clubSessionCost.deleteMany({
          where: { sessionId, category },
        });
      }
    }
  });

  const costs = await prisma.clubSessionCost.findMany({
    where: { sessionId },
    orderBy: { category: "asc" },
  });

  return NextResponse.json({ costs });
}
