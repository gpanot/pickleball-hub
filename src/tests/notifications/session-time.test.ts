import { describe, expect, it } from "vitest";
import {
  isSessionEndedInWindow,
  isSessionLive,
  minutesFromTimeStr,
} from "@/lib/notifications/session-time";

describe("session-time", () => {
  it("isSessionLive when now is between start and end", () => {
    expect(isSessionLive("12:00", "15:00", null, "13:30")).toBe(true);
    expect(isSessionLive("12:00", "15:00", null, "15:00")).toBe(false);
    expect(isSessionLive("12:00", "15:00", null, "11:59")).toBe(false);
  });

  it("isSessionLive uses durationMin when endTime missing", () => {
    expect(isSessionLive("12:00", null, 180, "14:00")).toBe(true);
    expect(isSessionLive("12:00", null, 180, "15:01")).toBe(false);
  });

  it("isSessionEndedInWindow", () => {
    expect(isSessionEndedInWindow("16:55", "16:00", "17:05")).toBe(true);
    expect(isSessionEndedInWindow("16:55", "16:56", "17:05")).toBe(false);
    expect(isSessionEndedInWindow("17:00", "16:00", "17:00")).toBe(true);
  });

  it("minutesFromTimeStr", () => {
    expect(minutesFromTimeStr("12:30")).toBe(12 * 60 + 30);
  });
});
