import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { sendAiMessage, type ChatMessage } from "@/lib/ai-assistant/chat";

const testSessionId = `test-cost-${Date.now()}`;

afterAll(async () => {
  await prisma.aiAssistantLog.deleteMany({ where: { sessionId: testSessionId } });
  await prisma.$disconnect();
});

describe("AI assistant cost monitoring", () => {
  it("logs token counts and cost for every AI response", async () => {
    await sendAiMessage({
      sessionId: testSessionId,
      message: "where can I play tomorrow morning?",
    });

    const log = await prisma.aiAssistantLog.findFirst({
      where: { sessionId: testSessionId, role: "assistant" },
    });

    expect(log).not.toBeNull();
    expect(log!.inputTokens).toBeGreaterThan(0);
    expect(log!.outputTokens).toBeGreaterThan(0);
    expect(log!.estimatedCostUsd).toBeGreaterThan(0);
    // Sanity check — context is ~55k tokens; at Sonnet pricing this is ~$0.17 per message.
    // Cap at $0.50 to catch runaway context growth without being too tight.
    expect(log!.estimatedCostUsd).toBeLessThan(0.50);

    console.log(
      `[cost-test] msg1 — input: ${log!.inputTokens} tokens, output: ${log!.outputTokens} tokens, cost: $${log!.estimatedCostUsd!.toFixed(6)}`,
    );
  }, 30000);

  it("second message in session has consistent input tokens (context not rebuilt)", async () => {
    // First message already sent above — send a second
    const history: ChatMessage[] = [
      { role: "user", content: "where can I play tomorrow morning?" },
    ];

    // Fetch first assistant response to build history
    const firstAssistantLog = await prisma.aiAssistantLog.findFirst({
      where: { sessionId: testSessionId, role: "assistant" },
      orderBy: { createdAt: "asc" },
    });
    if (firstAssistantLog) {
      history.push({ role: "assistant", content: firstAssistantLog.content });
    }

    await sendAiMessage({
      sessionId: testSessionId,
      message: "what venues are in Q7?",
      history,
    });

    const logs = await prisma.aiAssistantLog.findMany({
      where: { sessionId: testSessionId, role: "assistant" },
      orderBy: { createdAt: "asc" },
    });

    expect(logs.length).toBeGreaterThanOrEqual(2);

    const tokens1 = logs[0]!.inputTokens!;
    const tokens2 = logs[1]!.inputTokens!;

    console.log(
      `[cost-test] msg1 input tokens: ${tokens1} | msg2 input tokens: ${tokens2}`,
    );

    // The system prompt (context) is the dominant cost — it should be essentially
    // the same for both messages since the context snapshot is reused.
    // We allow up to 20% difference to account for conversation history growth.
    const diff = Math.abs(tokens1 - tokens2);
    const pct = diff / tokens1;

    console.log(
      `[cost-test] token diff: ${diff} (${(pct * 100).toFixed(1)}%) — expect < 20%`,
    );

    expect(pct).toBeLessThan(0.20);
  }, 30000);

  it("first message of a session stores a non-null contextSnapshot", async () => {
    const firstUserLog = await prisma.aiAssistantLog.findFirst({
      where: { sessionId: testSessionId, role: "user" },
      orderBy: { createdAt: "asc" },
    });

    expect(firstUserLog).not.toBeNull();
    expect(firstUserLog!.contextSnapshot).not.toBeNull();

    const snap = JSON.parse(firstUserLog!.contextSnapshot!);
    expect(snap.upcomingSessions).toBeDefined();
    expect(snap.venues).toBeDefined();
    expect(snap.clubs).toBeDefined();

    console.log(
      `[cost-test] context snapshot — sessions: ${snap.upcomingSessions.length}, venues: ${snap.venues.length}, clubs: ${snap.clubs.length}`,
    );
  });

  it("second message of a session does NOT store a contextSnapshot", async () => {
    const userLogs = await prisma.aiAssistantLog.findMany({
      where: { sessionId: testSessionId, role: "user" },
      orderBy: { createdAt: "asc" },
    });

    // First message: has snapshot. All subsequent: null.
    expect(userLogs[0]!.contextSnapshot).not.toBeNull();
    for (const log of userLogs.slice(1)) {
      expect(log.contextSnapshot).toBeNull();
    }
  });
});
