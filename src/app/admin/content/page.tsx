import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ContentDashboard } from "./ContentDashboard";

export const metadata: Metadata = { title: "Content Queue" };
export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/content");
  }

  const now = new Date();
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);
  const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-01`;

  const [pendingPosts, recentPosts, adminSettings, monthLogs] = await Promise.all([
    prisma.contentPost.findMany({
      where: { status: { in: ["pending", "approved"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.contentPost.findMany({
      where: {
        status: { in: ["posted", "skipped", "error"] },
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.adminSettings.findUnique({ where: { id: "singleton" } }),
    prisma.llmUsageLog.findMany({
      where: { createdAt: { gte: new Date(`${monthStart}T00:00:00+07:00`) } },
      select: { costUsd: true },
    }),
  ]);

  const monthSpend = monthLogs.reduce((s, r) => s + r.costUsd, 0);
  const budget = adminSettings?.monthlyBudgetUsd ?? 5.0;
  const budgetPct = budget > 0 ? monthSpend / budget : 0;

  return (
    <ContentDashboard
      initialPending={JSON.parse(JSON.stringify(pendingPosts))}
      initialHistory={JSON.parse(JSON.stringify(recentPosts))}
      monthSpend={monthSpend}
      budget={budget}
      budgetPct={budgetPct}
    />
  );
}
