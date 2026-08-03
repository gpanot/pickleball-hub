/**
 * GET /api/app-clubs/[id]/dashboard/export
 * Query: ?period=this_month|last_month|this_week|last_week|all  (default: this_month)
 *
 * Auth: can("VIEW_REVENUE") — OWNER and ADMIN only. HOST_MANAGER gets 403.
 *
 * Returns a CSV file with one row per session.
 * Net column is empty when hasCosts = false so the accountant knows it is incomplete.
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

function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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
        select: { id: true, paidStatus: true, paidAmount: true },
      },
      costs: {
        select: { category: true, amount: true },
      },
    },
  });

  const header = [
    "Date",
    "Session Name",
    "Venue",
    "Confirmed",
    "Max Players",
    "Fee",
    "Currency",
    "Gross Revenue",
    "Collected",
    "Court Rental",
    "Balls",
    "Coach Fee",
    "Other Costs",
    "Total Cost",
    "Net",
    "Status",
  ];

  const rows = sessions.map((s) => {
    const fee = s.feeAmount ?? new Decimal(0);
    const confirmedCount = s.bookings.length;

    const effectiveAmount = (b: { paidAmount: Decimal | null }) =>
      b.paidAmount !== null ? b.paidAmount : fee;

    const gross = s.bookings.reduce(
      (sum, b) => sum.add(effectiveAmount(b)),
      new Decimal(0),
    );
    const paidBookings = s.bookings.filter((b) => b.paidStatus);
    const paidCount = paidBookings.length;
    const collected = paidBookings.reduce(
      (sum, b) => sum.add(effectiveAmount(b)),
      new Decimal(0),
    );

    const costByCategory: Record<string, Decimal> = {};
    for (const c of s.costs) {
      costByCategory[c.category] = c.amount;
    }

    const totalCost = s.costs.reduce(
      (sum, c) => sum.add(c.amount),
      new Decimal(0),
    );
    const hasCosts = s.costs.length > 0;
    const net = hasCosts ? collected.sub(totalCost).toFixed(2) : "";

    const date = new Date(s.startTime)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

    return [
      esc(date),
      esc(s.name),
      esc(s.venue?.name ?? ""),
      esc(confirmedCount),
      esc(s.maxPlayers),
      esc(fee.toFixed(2)),
      esc(s.feeCurrency ?? "VND"),
      esc(gross.toFixed(2)),
      esc(collected.toFixed(2)),
      esc(costByCategory["court_rental"]?.toFixed(2) ?? ""),
      esc(costByCategory["balls"]?.toFixed(2) ?? ""),
      esc(costByCategory["coach_fee"]?.toFixed(2) ?? ""),
      esc(costByCategory["other"]?.toFixed(2) ?? ""),
      esc(totalCost.toFixed(2)),
      esc(net),
      esc(s.lifecycleState),
    ].join(",");
  });

  const csv = [header.map(esc).join(","), ...rows].join("\n");

  const today = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
    .replace(/-/g, "");
  const safePeriod = periodLabel(period).toLowerCase().replace(/\s+/g, "-");
  const filename = `squadd-sessions-${safePeriod}-${today}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
