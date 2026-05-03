import { describe, it, expect } from "vitest";
import { buildHeatmapContext } from "@/lib/ai-assistant/context";

describe("buildHeatmapContext", () => {
  it("returns upcoming sessions with all required fields", async () => {
    const context = await buildHeatmapContext();

    expect(context.upcomingSessions.length).toBeGreaterThan(0);

    for (const session of context.upcomingSessions) {
      // Date in YYYY-MM-DD
      expect(session.date, "session.date").toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Times in HH:MM
      expect(session.startTime, "session.startTime").toMatch(/^\d{2}:\d{2}$/);
      expect(session.endTime, "session.endTime").toMatch(/^\d{2}:\d{2}$/);

      expect(session.club, "session.club").toBeDefined();
      expect(session.club.length, "session.club not empty").toBeGreaterThan(0);

      expect(session.venue, "session.venue").toBeDefined();

      expect(typeof session.priceVnd, "session.priceVnd is number").toBe("number");

      expect(session.spotsTotal, "session.spotsTotal").toBeDefined();
      expect(typeof session.spotsTotal).toBe("number");

      expect(session.spotsLeft, "session.spotsLeft").toBeDefined();
      expect(typeof session.spotsLeft).toBe("number");
      expect(session.spotsLeft).toBeGreaterThanOrEqual(0);
      expect(session.spotsLeft).toBeLessThanOrEqual(session.spotsTotal);

      expect("duprMin" in session, "duprMin field present").toBe(true);
      expect("duprMax" in session, "duprMax field present").toBe(true);

      expect(
        ["available", "filling", "full"].includes(session.fillingStatus),
        "fillingStatus is valid",
      ).toBe(true);
    }
  });

  it("includes no artificial session cap (all sessions within the window)", async () => {
    const context = await buildHeatmapContext();
    // With compression (~15 tokens/session) even 500 sessions fit well under 10k tokens.
    // There is no hard cap — just verify we have sessions and estimatedTokens is sane.
    expect(context.upcomingSessions.length).toBeGreaterThan(0);
    expect(context.estimatedTokens).toBeGreaterThan(0);
  });

  it("all sessions are within the configured lookback window", async () => {
    const context = await buildHeatmapContext();
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = vnNow.toISOString().slice(0, 10);
    // window end = contextHours from now
    const windowEnd = new Date(vnNow.getTime() + context.windowHours * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    for (const session of context.upcomingSessions) {
      expect(session.date >= todayStr, `${session.date} >= today`).toBe(true);
      expect(session.date <= windowEnd, `${session.date} <= windowEnd`).toBe(true);
    }
  });

  it("returns venues with required fields", async () => {
    const context = await buildHeatmapContext();
    expect(context.venues.length).toBeGreaterThan(0);
    for (const venue of context.venues) {
      expect(venue.name).toBeDefined();
      expect(venue.address).toBeDefined();
      expect(typeof venue.sessionCount90d).toBe("number");
    }
  });

  it("returns the same session count on two consecutive calls", async () => {
    const context1 = await buildHeatmapContext();
    const context2 = await buildHeatmapContext();
    expect(context1.upcomingSessions.length).toBe(context2.upcomingSessions.length);
    expect(context1.venues.length).toBe(context2.venues.length);
    expect(context1.clubs.length).toBe(context2.clubs.length);
  });

  it("context has the expected top-level shape including estimatedTokens", async () => {
    const context = await buildHeatmapContext();
    expect(context.builtAt).toBeDefined();
    expect(new Date(context.builtAt).toISOString()).toBe(context.builtAt);
    expect(context.windowHours).toBeGreaterThan(0);
    expect(typeof context.estimatedTokens).toBe("number");
    expect(context.estimatedTokens).toBeGreaterThan(0);
    expect(Array.isArray(context.upcomingSessions)).toBe(true);
    expect(Array.isArray(context.venues)).toBe(true);
    expect(Array.isArray(context.clubs)).toBe(true);
  });
});
