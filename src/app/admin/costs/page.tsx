import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CostsDashboard } from "./CostsDashboard";

export const metadata: Metadata = { title: "LLM Costs" };
export const dynamic = "force-dynamic";

export default async function AdminCostsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/costs");
  }

  const now = new Date();
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);
  const todayStr = vnNow.toISOString().slice(0, 10);
  const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-01`;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [adminSettings, todayLogs, monthLogs, historyLogs] = await Promise.all([
    prisma.adminSettings.findUnique({ where: { id: "singleton" } }),
    prisma.llmUsageLog.findMany({
      where: {
        createdAt: {
          gte: new Date(`${todayStr}T00:00:00+07:00`),
          lt: new Date(`${todayStr}T23:59:59+07:00`),
        },
      },
    }),
    prisma.llmUsageLog.findMany({
      where: { createdAt: { gte: new Date(`${monthStart}T00:00:00+07:00`) } },
    }),
    prisma.llmUsageLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const budget = adminSettings?.monthlyBudgetUsd ?? 5.0;

  const today = {
    date: todayStr,
    spend: todayLogs.reduce((s, r) => s + r.costUsd, 0),
    inputTokens: todayLogs.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: todayLogs.reduce((s, r) => s + r.outputTokens, 0),
    calls: todayLogs.length,
  };

  const monthSpend = monthLogs.reduce((s, r) => s + r.costUsd, 0);
  const month = {
    label: vnNow.toLocaleString("en-US", { month: "long", year: "numeric" }),
    spend: monthSpend,
    budget,
    calls: monthLogs.length,
    avgCostPerCall: monthLogs.length > 0 ? monthSpend / monthLogs.length : 0,
  };

  // Group history by VN date
  const byDate = new Map<string, {
    date: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>();
  for (const log of historyLogs) {
    const vnDate = new Date(log.createdAt.getTime() + vnOffsetMs).toISOString().slice(0, 10);
    const ex = byDate.get(vnDate);
    if (ex) {
      ex.calls++;
      ex.inputTokens += log.inputTokens;
      ex.outputTokens += log.outputTokens;
      ex.costUsd += log.costUsd;
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

  return (
    <CostsDashboard
      today={today}
      month={month}
      history={history}
    />
  );
}
