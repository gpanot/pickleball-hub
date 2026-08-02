/**
 * Unit tests for club-permissions.ts
 *
 * These tests use Vitest and mock the Prisma client so they run without a DB.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ClubRole } from "@prisma/client";

// ── Mock Prisma ────────────────────────────────────────────────────────────────
vi.mock("@/lib/db", () => ({
  prisma: {
    appClubManager: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  can,
  getClubRole,
  isAnyManager,
  isOwner,
  isOwnerOrAdmin,
  type ClubPermission,
} from "@/lib/club-permissions";

const CLUB_ID = "club-1";
const PLAYER_ID = "player-1";

function mockRole(role: ClubRole | null) {
  vi.mocked(prisma.appClubManager.findFirst).mockResolvedValue(
    role ? ({ id: "row-1", role } as never) : null,
  );
}

// ── Permission matrix ──────────────────────────────────────────────────────────

describe("can() — session ops (all roles)", () => {
  const sessionOps: ClubPermission[] = [
    "CREATE_SESSION",
    "EDIT_SESSION",
    "CANCEL_SESSION",
    "MANAGE_ROSTER",
    "MARK_PAID",
    "MARK_ATTENDANCE",
  ];

  for (const perm of sessionOps) {
    it(`OWNER can ${perm}`, async () => {
      mockRole(ClubRole.OWNER);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(true);
    });
    it(`ADMIN can ${perm}`, async () => {
      mockRole(ClubRole.ADMIN);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(true);
    });
    it(`HOST_MANAGER can ${perm}`, async () => {
      mockRole(ClubRole.HOST_MANAGER);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(true);
    });
    it(`non-manager cannot ${perm}`, async () => {
      mockRole(null);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(false);
    });
  }
});

describe("can() — Owner+Admin ops", () => {
  const ownerAdminOps: ClubPermission[] = [
    "VIEW_REVENUE",
    "EDIT_CLUB",
    "MANAGE_HOST_MANAGERS",
  ];

  for (const perm of ownerAdminOps) {
    it(`OWNER can ${perm}`, async () => {
      mockRole(ClubRole.OWNER);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(true);
    });
    it(`ADMIN can ${perm}`, async () => {
      mockRole(ClubRole.ADMIN);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(true);
    });
    it(`HOST_MANAGER cannot ${perm}`, async () => {
      mockRole(ClubRole.HOST_MANAGER);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(false);
    });
    it(`non-manager cannot ${perm}`, async () => {
      mockRole(null);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(false);
    });
  }
});

describe("can() — Owner-only ops", () => {
  const ownerOnlyOps: ClubPermission[] = [
    "MANAGE_ADMINS",
    "DELETE_CLUB",
    "TRANSFER_OWNERSHIP",
    "CANCEL_SERIES",
  ];

  for (const perm of ownerOnlyOps) {
    it(`OWNER can ${perm}`, async () => {
      mockRole(ClubRole.OWNER);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(true);
    });
    it(`ADMIN cannot ${perm}`, async () => {
      mockRole(ClubRole.ADMIN);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(false);
    });
    it(`HOST_MANAGER cannot ${perm}`, async () => {
      mockRole(ClubRole.HOST_MANAGER);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(false);
    });
    it(`non-manager cannot ${perm}`, async () => {
      mockRole(null);
      expect(await can(PLAYER_ID, CLUB_ID, perm)).toBe(false);
    });
  }
});

// ── Convenience wrappers ───────────────────────────────────────────────────────

describe("getClubRole()", () => {
  it("returns the role when found", async () => {
    mockRole(ClubRole.ADMIN);
    expect(await getClubRole(PLAYER_ID, CLUB_ID)).toBe(ClubRole.ADMIN);
  });
  it("returns null when not a manager", async () => {
    mockRole(null);
    expect(await getClubRole(PLAYER_ID, CLUB_ID)).toBeNull();
  });
});

describe("isAnyManager()", () => {
  it("returns true for OWNER", async () => {
    vi.mocked(prisma.appClubManager.findFirst).mockResolvedValue({ id: "x" } as never);
    expect(await isAnyManager(PLAYER_ID, CLUB_ID)).toBe(true);
  });
  it("returns false for non-manager", async () => {
    vi.mocked(prisma.appClubManager.findFirst).mockResolvedValue(null);
    expect(await isAnyManager(PLAYER_ID, CLUB_ID)).toBe(false);
  });
});

describe("isOwner()", () => {
  it("returns true for OWNER", async () => {
    vi.mocked(prisma.appClubManager.findFirst).mockResolvedValue({ id: "x" } as never);
    expect(await isOwner(PLAYER_ID, CLUB_ID)).toBe(true);
  });
  it("returns false for ADMIN", async () => {
    vi.mocked(prisma.appClubManager.findFirst).mockResolvedValue(null);
    expect(await isOwner(PLAYER_ID, CLUB_ID)).toBe(false);
  });
});

describe("isOwnerOrAdmin()", () => {
  it("returns true when row found", async () => {
    vi.mocked(prisma.appClubManager.findFirst).mockResolvedValue({ id: "x" } as never);
    expect(await isOwnerOrAdmin(PLAYER_ID, CLUB_ID)).toBe(true);
  });
  it("returns false for HOST_MANAGER / non-manager", async () => {
    vi.mocked(prisma.appClubManager.findFirst).mockResolvedValue(null);
    expect(await isOwnerOrAdmin(PLAYER_ID, CLUB_ID)).toBe(false);
  });
});
