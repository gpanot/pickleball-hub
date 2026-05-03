import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateContextSnapshot, buildHeatmapContext } from "@/lib/ai-assistant/context";
import type { HeatmapContext } from "@/lib/ai-assistant/context";

const testSessionId = `test-snapshot-${Date.now()}`;

afterAll(async () => {
  await prisma.aiAssistantLog.deleteMany({ where: { sessionId: testSessionId } });
  await prisma.$disconnect();
});

describe("context snapshot persistence", () => {
  it("creates a new context snapshot on first call and saves it to DB", async () => {
    const context = await getOrCreateContextSnapshot(testSessionId);

    expect(context).toBeDefined();
    expect(Array.isArray(context.upcomingSessions)).toBe(true);
    expect(Array.isArray(context.venues)).toBe(true);
    expect(Array.isArray(context.clubs)).toBe(true);
    expect(context.builtAt).toBeDefined();

    // Verify it was persisted
    const log = await prisma.aiAssistantLog.findFirst({
      where: { sessionId: testSessionId, contextSnapshot: { not: null } },
    });
    expect(log).not.toBeNull();
    expect(log?.contextSnapshot).toBeDefined();

    const parsed = JSON.parse(log!.contextSnapshot!) as HeatmapContext;
    expect(parsed.builtAt).toBe(context.builtAt);
    expect(parsed.upcomingSessions.length).toBe(context.upcomingSessions.length);
  });

  it("returns the identical snapshot on a second call for the same session", async () => {
    const context1 = await getOrCreateContextSnapshot(testSessionId);
    const context2 = await getOrCreateContextSnapshot(testSessionId);

    // builtAt must match — same snapshot object, not a freshly built one
    expect(context1.builtAt).toBe(context2.builtAt);
    expect(context1.upcomingSessions.length).toBe(context2.upcomingSessions.length);
    expect(context1.venues.length).toBe(context2.venues.length);
    expect(context1.clubs.length).toBe(context2.clubs.length);
  });

  it("does not call buildHeatmapContext when a snapshot already exists", async () => {
    // Spy on the module-level function
    const buildSpy = vi.spyOn(
      await import("@/lib/ai-assistant/context"),
      "buildHeatmapContext",
    );

    // This session already has a snapshot from the first test above
    await getOrCreateContextSnapshot(testSessionId);

    expect(buildSpy).not.toHaveBeenCalled();
    buildSpy.mockRestore();
  });

  it("creates separate independent snapshots for different sessionIds", async () => {
    const otherId = `test-snapshot-other-${Date.now()}`;
    try {
      const context1 = await getOrCreateContextSnapshot(testSessionId);
      const context2 = await getOrCreateContextSnapshot(otherId);

      // Both should be valid contexts — different session IDs, same underlying data
      expect(context1.builtAt).toBeDefined();
      expect(context2.builtAt).toBeDefined();
      // They may have the same session count since they read the same DB state
      expect(context1.upcomingSessions.length).toBe(context2.upcomingSessions.length);
    } finally {
      await prisma.aiAssistantLog.deleteMany({ where: { sessionId: otherId } });
    }
  });
});
