import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function vnDayBoundary(offsetDays = 0): Date {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const dayStr = new Date(vnNow.getTime() + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);
  return new Date(`${dayStr}T00:00:00+07:00`);
}

function sumCost(logs: { estimatedCostUsd: number | null }[]) {
  return logs.reduce((s, l) => s + (l.estimatedCostUsd ?? 0), 0);
}

function splitBySource(logs: { estimatedCostUsd: number | null; source: string }[]) {
  const player = logs.filter((l) => l.source === "player");
  const admin = logs.filter((l) => l.source !== "player");
  return {
    total: sumCost(logs),
    player: sumCost(player),
    admin: sumCost(admin),
    messageCount: {
      total: logs.length,
      player: player.length,
      admin: admin.length,
    },
  };
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStart = vnDayBoundary(0);
  const weekStart = vnDayBoundary(-6);
  const monthStart = (() => {
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return new Date(
      `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-01T00:00:00+07:00`,
    );
  })();

  const [todayLogs, weekLogs, monthLogs] = await Promise.all([
    prisma.aiAssistantLog.findMany({
      where: { role: "assistant", createdAt: { gte: todayStart } },
      select: { estimatedCostUsd: true, source: true },
    }),
    prisma.aiAssistantLog.findMany({
      where: { role: "assistant", createdAt: { gte: weekStart } },
      select: { estimatedCostUsd: true, source: true },
    }),
    prisma.aiAssistantLog.findMany({
      where: { role: "assistant", createdAt: { gte: monthStart } },
      select: { estimatedCostUsd: true, source: true },
    }),
  ]);

  return NextResponse.json({
    today: splitBySource(todayLogs),
    thisWeek: splitBySource(weekLogs),
    thisMonth: splitBySource(monthLogs),
  });
}
