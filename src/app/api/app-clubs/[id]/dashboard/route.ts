/**
 * GET /api/app-clubs/[id]/dashboard
 * Query: ?period=this_month|last_month|this_week|last_week|all  (default: this_month)
 *
 * Auth: can("VIEW_REVENUE") — OWNER and ADMIN only. HOST_MANAGER gets 403.
 *
 * Returns aggregated P&L summary for the club over the requested period.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { can } from "@/lib/club-permissions";
import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import {
  periodBounds,
  periodLabel,
  type DashboardPeriod,
} from "@/lib/club-sessions/dashboard-period";

const VALID_PERIODS: DashboardPeriod[] = [
  "this_month",
  "last_month",
  "this_week",
  "last_week",
  "all",
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clubId } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authorized = await can(user.profileId, clubId, "VIEW_REVENUE");
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "this_month";
  const period = VALID_PERIODS.includes(rawPeriod as DashboardPeriod)
    ? (rawPeriod as DashboardPeriod)
    : "this_month";

  const bounds = periodBounds(period);

  const sessions = await prisma.clubSession.findMany({
    where: {
      appClubId: clubId,
      lifecycleState: { in: ["published", "cancelled"] },
      ...(bounds
        ? { startTime: { gte: bounds.start, lt: bounds.end } }
        : {}),
    },
    orderBy: { startTime: "desc" },
    select: {
      id: true,
      name: true,
      startTime: true,
      maxPlayers: true,
      feeAmount: true,
      feeCurrency: true,
      lifecycleState: true,
      venue: { select: { name: true } },
      bookings: {
        where: { status: "confirmed" },
        select: { id: true, paidStatus: true },
      },
      costs: {
        select: { category: true, amount: true, currency: true },
      },
    },
  });

  const memberCount = await prisma.appClubMember.count({
    where: { appClubId: clubId },
  });

  // Aggregate
  let totalRevenue = new Decimal(0);
  let totalCollected = new Decimal(0);
  let totalCost = new Decimal(0);
  let totalFillRate = 0;
  let fillRateCount = 0;

  const sessionRows = sessions.map((s) => {
    const fee = s.feeAmount ?? new Decimal(0);
    const confirmedCount = s.bookings.length;
    const paidCount = s.bookings.filter((b) => b.paidStatus).length;

    const gross = fee.mul(confirmedCount);
    const collected = fee.mul(paidCount);
    const sessionCost = s.costs.reduce(
      (sum, c) => sum.add(c.amount),
      new Decimal(0),
    );
    const hasCosts = s.costs.length > 0;
    const net = hasCosts ? collected.sub(sessionCost).toFixed(2) : null;

    totalRevenue = totalRevenue.add(gross);
    totalCollected = totalCollected.add(collected);
    totalCost = totalCost.add(sessionCost);

    const fillRate =
      s.maxPlayers > 0
        ? Math.min(1, confirmedCount / s.maxPlayers) * 100
        : 0;
    totalFillRate += fillRate;
    fillRateCount += 1;

    return {
      sessionId: s.id,
      name: s.name,
      startTime: s.startTime.toISOString(),
      confirmedCount,
      maxPlayers: s.maxPlayers,
      feeAmount: fee.toFixed(2),
      feeCurrency: s.feeCurrency ?? "VND",
      collected: collected.toFixed(2),
      net,
      hasCosts,
      lifecycleState: s.lifecycleState,
      venueName: s.venue?.name ?? null,
    };
  });

  const net = totalCollected.sub(totalCost);
  const collectionRate = totalRevenue.gt(0)
    ? Math.round(
        totalCollected.div(totalRevenue).mul(100).toNumber(),
      )
    : 0;
  const avgFillRate =
    fillRateCount > 0 ? Math.round(totalFillRate / fillRateCount) : 0;

  return NextResponse.json({
    period,
    periodLabel: periodLabel(period),
    totalRevenue: totalRevenue.toFixed(2),
    collected: totalCollected.toFixed(2),
    totalCost: totalCost.toFixed(2),
    net: net.toFixed(2),
    collectionRate,
    sessionCount: sessions.length,
    avgFillRate,
    memberCount,
    sessions: sessionRows,
  });
}
