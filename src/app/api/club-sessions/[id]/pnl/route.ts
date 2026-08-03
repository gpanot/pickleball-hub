/**
 * GET /api/club-sessions/[id]/pnl
 *
 * Returns computed P&L for a single session. All monetary values serialised
 * as Decimal strings (Prisma default). Never cast to Number server-side.
 *
 * Auth: any manager of the club that owns this session (isAnyManager).
 *
 * Formulas (paidAmount override respected per booking):
 *   effectiveAmount(b) = b.paidAmount ?? feeAmount
 *   confirmedCount  = count(bookings where status = "confirmed")
 *   grossRevenue    = sum(effectiveAmount) for all confirmed bookings
 *   paidCount       = count(confirmed bookings where paidStatus = true)
 *   collected       = sum(effectiveAmount) for paid confirmed bookings
 *   unpaid          = sum(effectiveAmount) for unpaid confirmed bookings
 *   totalCost       = sum(ClubSessionCost.amount)
 *   net             = collected − totalCost
 *   collectionRate  = grossRevenue > 0 ? (collected / grossRevenue × 100) : 0
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isAnyManager } from "@/lib/club-permissions";
import { getSessionClubId } from "@/lib/club-auth";
import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";

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

  const [session, confirmedBookings, costs] = await Promise.all([
    prisma.clubSession.findUnique({
      where: { id: sessionId },
      select: { feeAmount: true, feeCurrency: true },
    }),
    prisma.clubSessionBooking.findMany({
      where: { clubSessionId: sessionId, status: "confirmed" },
      select: {
        id: true,
        paidStatus: true,
        paidAmount: true,
        player: { select: { displayName: true, squadNickname: true } },
      },
    }),
    prisma.clubSessionCost.findMany({
      where: { sessionId },
      select: { category: true, amount: true, currency: true, notes: true },
    }),
  ]);

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const fee = session.feeAmount ?? new Decimal(0);
  const confirmedCount = confirmedBookings.length;

  // Effective amount per booking: paidAmount override takes precedence over session fee
  const effectiveAmount = (b: { paidAmount: Decimal | null }) =>
    b.paidAmount !== null ? b.paidAmount : fee;

  const grossRevenue = confirmedBookings.reduce(
    (sum, b) => sum.add(effectiveAmount(b)),
    new Decimal(0),
  );

  const paidBookings = confirmedBookings.filter((b) => b.paidStatus);
  const paidCount = paidBookings.length;
  const collected = paidBookings.reduce(
    (sum, b) => sum.add(effectiveAmount(b)),
    new Decimal(0),
  );

  const unpaid = grossRevenue.sub(collected);

  const unpaidPlayers = confirmedBookings
    .filter((b) => !b.paidStatus)
    .map((b) => ({
      bookingId: b.id,
      playerNickname: b.player.squadNickname ?? b.player.displayName ?? "Player",
      amount: effectiveAmount(b).toFixed(2),
    }));

  const totalCost = costs.reduce(
    (sum, c) => sum.add(c.amount),
    new Decimal(0),
  );

  const net = collected.sub(totalCost);

  const collectionRate = grossRevenue.gt(0)
    ? Math.round(collected.div(grossRevenue).mul(100).toNumber())
    : 0;

  return NextResponse.json({
    sessionId,
    feeAmount: fee.toFixed(2),
    feeCurrency: session.feeCurrency ?? "VND",
    confirmedCount,
    paidCount,
    grossRevenue: grossRevenue.toFixed(2),
    collected: collected.toFixed(2),
    unpaid: unpaid.toFixed(2),
    unpaidPlayers,
    costs: costs.map((c) => ({
      category: c.category,
      amount: c.amount.toFixed(2),
      currency: c.currency,
      notes: c.notes ?? undefined,
    })),
    totalCost: totalCost.toFixed(2),
    net: net.toFixed(2),
    collectionRate,
    hasCosts: costs.length > 0,
  });
}
