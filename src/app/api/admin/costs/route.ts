import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/costs?period=month
 *
 * Returns:
 *   - today: { spend, inputTokens, outputTokens, calls }
 *   - month: { label, spend, budget, calls, avgCostPerCall }
 *   - history: last 30 days, one row per day
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Vietnam is UTC+7
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);

  const todayStr = vnNow.toISOString().slice(0, 10);
  const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-01`;

  // Fetch admin settings for budget
  const adminSettings = await prisma.adminSettings.findUnique({ where: { id: "singleton" } });
  const budget = adminSettings?.monthlyBudgetUsd ?? 5.0;

  // Today stats
  const todayLogs = await prisma.llmUsageLog.findMany({
    where: {
      createdAt: {
        gte: new Date(`${todayStr}T00:00:00+07:00`),
        lt: new Date(`${todayStr}T23:59:59+07:00`),
      },
    },
  });

  const todaySpend = todayLogs.reduce((s, r) => s + r.costUsd, 0);
  const todayInputTokens = todayLogs.reduce((s, r) => s + r.inputTokens, 0);
  const todayOutputTokens = todayLogs.reduce((s, r) => s + r.outputTokens, 0);

  // Month stats
  const monthLogs = await prisma.llmUsageLog.findMany({
    where: {
      createdAt: { gte: new Date(`${monthStart}T00:00:00+07:00`) },
    },
  });

  const monthSpend = monthLogs.reduce((s, r) => s + r.costUsd, 0);
  const monthCalls = monthLogs.length;
  const avgCostPerCall = monthCalls > 0 ? monthSpend / monthCalls : 0;

  // Last 30 days — group by date (VN date via date_trunc + offset)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const historyLogs = await prisma.llmUsageLog.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
  });

  // Group by VN calendar date
  const byDate = new Map<string, {
    date: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>();

  for (const log of historyLogs) {
    const vnDate = new Date(log.createdAt.getTime() + vnOffsetMs)
      .toISOString()
      .slice(0, 10);
    const existing = byDate.get(vnDate);
    if (existing) {
      existing.calls++;
      existing.inputTokens += log.inputTokens;
      existing.outputTokens += log.outputTokens;
      existing.costUsd += log.costUsd;
      // Keep most recent model for the day
    } else {
      byDate.set(vnDate, {
        date: vnDate,
        model: log.model,
        calls: 1,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        costUsd: log.costUsd,
      });
    }
  }

  const history = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    today: {
      date: todayStr,
      spend: todaySpend,
      inputTokens: todayInputTokens,
      outputTokens: todayOutputTokens,
      calls: todayLogs.length,
    },
    month: {
      label: vnNow.toLocaleString("en-US", { month: "long", year: "numeric" }),
      spend: monthSpend,
      budget,
      calls: monthCalls,
      avgCostPerCall,
    },
    history,
  });
}
