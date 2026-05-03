import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the 10 most recent distinct session IDs
  const recentSessions = await prisma.$queryRaw<{ session_id: string; first_at: Date }[]>`
    SELECT session_id, MIN(created_at) AS first_at
    FROM ai_assistant_logs
    GROUP BY session_id
    ORDER BY first_at DESC
    LIMIT 10
  `;

  if (!recentSessions.length) {
    return NextResponse.json({ sessions: [] });
  }

  const sessionIds = recentSessions.map((r) => r.session_id);

  const allLogs = await prisma.aiAssistantLog.findMany({
    where: { sessionId: { in: sessionIds } },
    orderBy: { createdAt: "asc" },
  });

  // Group logs by session
  const grouped = new Map<
    string,
    {
      sessionId: string;
      startedAt: Date;
      messages: typeof allLogs;
    }
  >();

  for (const log of allLogs) {
    if (!grouped.has(log.sessionId)) {
      grouped.set(log.sessionId, {
        sessionId: log.sessionId,
        startedAt: log.createdAt,
        messages: [],
      });
    }
    grouped.get(log.sessionId)!.messages.push(log);
  }

  const sessions = recentSessions.map((r) => {
    const group = grouped.get(r.session_id);
    const messages = group?.messages ?? [];
    const totalInputTokens = messages.reduce((s, m) => s + (m.inputTokens ?? 0), 0);
    const totalOutputTokens = messages.reduce((s, m) => s + (m.outputTokens ?? 0), 0);
    const totalCost = messages.reduce((s, m) => s + (m.estimatedCostUsd ?? 0), 0);

    // Extract context metadata from the snapshot stored on the first message
    const snapshotRaw = messages.find((m) => m.contextSnapshot)?.contextSnapshot ?? null;
    let contextMeta: {
      builtAt: string;
      sessionCount: number;
      venueCount: number;
      clubCount: number;
      estimatedTokens: number;
    } | null = null;
    if (snapshotRaw) {
      try {
        const snap = JSON.parse(snapshotRaw) as {
          builtAt?: string;
          upcomingSessions?: unknown[];
          venues?: unknown[];
          clubs?: unknown[];
          estimatedTokens?: number;
        };
        contextMeta = {
          builtAt: snap.builtAt ?? "",
          sessionCount: snap.upcomingSessions?.length ?? 0,
          venueCount: snap.venues?.length ?? 0,
          clubCount: snap.clubs?.length ?? 0,
          estimatedTokens: snap.estimatedTokens ?? 0,
        };
      } catch {
        // ignore malformed snapshot
      }
    }

    return {
      sessionId: r.session_id,
      startedAt: r.first_at,
      messageCount: messages.length,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: totalCost,
      contextMeta,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        estimatedCostUsd: m.estimatedCostUsd,
        createdAt: m.createdAt,
      })),
    };
  });

  return NextResponse.json({ sessions });
}

export async function DELETE() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.aiAssistantLog.deleteMany({});
  return NextResponse.json({ deleted: true });
}
