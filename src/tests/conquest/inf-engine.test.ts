import { describe, it, expect } from "vitest";
import {
  calculateSessionInf,
  calculateCardPower,
  resolveCardBattle,
} from "@/lib/conquest/inf-engine";

describe("calculateSessionInf", () => {
  it("solo session, no clash = 300 INF", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 1,
      isClashActive: false,
      isOverlord: false,
      cardBattlesWon: 0,
      cardPowerPerWin: 0,
    });
    expect(result.total).toBe(300);
    expect(result.base).toBe(300);
    expect(result.copresenceBonus).toBe(0);
    expect(result.clashMultiplier).toBe(1.0);
    expect(result.defenseMultiplier).toBe(1.0);
    expect(result.cardBonus).toBe(0);
  });

  it("2 members co-present, no clash = 450 INF", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 2,
      isClashActive: false,
      isOverlord: false,
      cardBattlesWon: 0,
      cardPowerPerWin: 0,
    });
    expect(result.total).toBe(450);
    expect(result.copresenceBonus).toBe(150);
  });

  it("4 members co-present, clash active = (300+450)*2.0 = 1500", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 4,
      isClashActive: true,
      isOverlord: false,
      cardBattlesWon: 0,
      cardPowerPerWin: 0,
    });
    expect(result.total).toBe(1500);
    expect(result.copresenceBonus).toBe(450);
    expect(result.clashMultiplier).toBe(2.0);
  });

  it("co-presence capped at 3 extras (5 members = same as 4)", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 5,
      isClashActive: false,
      isOverlord: false,
      cardBattlesWon: 0,
      cardPowerPerWin: 0,
    });
    expect(result.copresenceBonus).toBe(450);
    expect(result.total).toBe(750);
  });

  it("Overlord defense bonus = x1.1", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 1,
      isClashActive: false,
      isOverlord: true,
      cardBattlesWon: 0,
      cardPowerPerWin: 0,
    });
    expect(result.total).toBe(330); // floor(300 * 1.1) = 330
    expect(result.defenseMultiplier).toBe(1.1);
  });

  it("full scenario: 4 copresent, clash, overlord, 1 card won (power 300)", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 4,
      isClashActive: true,
      isOverlord: true,
      cardBattlesWon: 1,
      cardPowerPerWin: 300,
    });
    // (300 + 450) * 2.0 * 1.1 = 750 * 2.2 = 1650
    // + 300 card bonus = 1950
    expect(result.total).toBe(1950);
  });

  it("card bonus adds after multiplication", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 1,
      isClashActive: true,
      isOverlord: false,
      cardBattlesWon: 1,
      cardPowerPerWin: 200,
    });
    // floor(300 * 2.0 * 1.0) + 200 = 600 + 200 = 800
    expect(result.total).toBe(800);
  });

  it("2 card battles won doubles the card bonus", () => {
    const result = calculateSessionInf({
      squadMembersCopresent: 1,
      isClashActive: true,
      isOverlord: false,
      cardBattlesWon: 2,
      cardPowerPerWin: 250,
    });
    // floor(300 * 2.0) + 2*250 = 600 + 500 = 1100
    expect(result.total).toBe(1100);
  });
});

describe("calculateCardPower", () => {
  it("D2 Lions example from spec: level 4, 2 venues, 5 active members = 300", () => {
    const power = calculateCardPower({
      venuesOwned: 2,
      squadLevel: 4,
      activeMembersThisWeek: 5,
    });
    // (2*50 + 5*30) * (1.0 + 4*0.05) = (100 + 150) * 1.20 = 250 * 1.20 = 300
    expect(power).toBe(300);
  });

  it("new squad: level 1, 0 venues, 1 member", () => {
    const power = calculateCardPower({
      venuesOwned: 0,
      squadLevel: 1,
      activeMembersThisWeek: 1,
    });
    // (0 + 30) * 1.05 = 31.5 → floor = 31
    expect(power).toBe(31);
  });

  it("venues capped at 3", () => {
    const power = calculateCardPower({
      venuesOwned: 5,
      squadLevel: 1,
      activeMembersThisWeek: 0,
    });
    // (3*50 + 0) * 1.05 = 150 * 1.05 = 157.5 → 157
    expect(power).toBe(157);
  });

  it("active members capped at 8", () => {
    const power = calculateCardPower({
      venuesOwned: 0,
      squadLevel: 1,
      activeMembersThisWeek: 12,
    });
    // (0 + 8*30) * 1.05 = 240 * 1.05 = 252
    expect(power).toBe(252);
  });

  it("level 10 multiplier", () => {
    const power = calculateCardPower({
      venuesOwned: 3,
      squadLevel: 10,
      activeMembersThisWeek: 8,
    });
    // (150 + 240) * (1.0 + 0.50) = 390 * 1.50 = 585
    expect(power).toBe(585);
  });
});

describe("resolveCardBattle", () => {
  it("higher power wins", () => {
    const winner = resolveCardBattle({
      initiatingCardPower: 200,
      rivalCardPower: 300,
      initiatingSquadId: "squad-a",
      rivalSquadId: "squad-b",
    });
    expect(winner).toBe("squad-b");
  });

  it("tie goes to initiator", () => {
    const winner = resolveCardBattle({
      initiatingCardPower: 300,
      rivalCardPower: 300,
      initiatingSquadId: "squad-a",
      rivalSquadId: "squad-b",
    });
    expect(winner).toBe("squad-a");
  });

  it("initiator wins when higher", () => {
    const winner = resolveCardBattle({
      initiatingCardPower: 500,
      rivalCardPower: 300,
      initiatingSquadId: "squad-a",
      rivalSquadId: "squad-b",
    });
    expect(winner).toBe("squad-a");
  });
});
