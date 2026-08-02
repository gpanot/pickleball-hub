/**
 * Role-based permission helper for Club Sessions.
 *
 * Every mutating route on clubs, sessions, and bookings must call can() rather
 * than checking roles directly.  Thin wrappers (isAnyManager, isOwner,
 * isOwnerOrAdmin) are available for common guards.
 *
 * Permission matrix:
 *
 *  Permission              | OWNER | ADMIN | HOST_MANAGER
 *  ------------------------|-------|-------|-------------
 *  CREATE_SESSION          |   ✓   |   ✓   |      ✓
 *  EDIT_SESSION            |   ✓   |   ✓   |      ✓
 *  CANCEL_SESSION          |   ✓   |   ✓   |      ✓
 *  MANAGE_ROSTER           |   ✓   |   ✓   |      ✓
 *  MARK_PAID               |   ✓   |   ✓   |      ✓
 *  MARK_ATTENDANCE         |   ✓   |   ✓   |      ✓
 *  VIEW_REVENUE            |   ✓   |   ✓   |      ✗
 *  EDIT_CLUB               |   ✓   |   ✓   |      ✗
 *  MANAGE_HOST_MANAGERS    |   ✓   |   ✓   |      ✗
 *  MANAGE_ADMINS           |   ✓   |   ✗   |      ✗
 *  DELETE_CLUB             |   ✓   |   ✗   |      ✗
 *  TRANSFER_OWNERSHIP      |   ✓   |   ✗   |      ✗
 *  CANCEL_SERIES           |   ✓   |   ✗   |      ✗   (stub — no series model yet)
 */

import { ClubRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ClubPermission =
  | "CREATE_SESSION"
  | "EDIT_SESSION"
  | "CANCEL_SESSION"
  | "MANAGE_ROSTER"
  | "MARK_PAID"
  | "MARK_ATTENDANCE"
  | "VIEW_REVENUE"
  | "EDIT_CLUB"
  | "MANAGE_HOST_MANAGERS"
  | "MANAGE_ADMINS"
  | "DELETE_CLUB"
  | "TRANSFER_OWNERSHIP"
  | "CANCEL_SERIES";

/** Permissions available to all three roles. */
const ALL_ROLES_PERMISSIONS = new Set<ClubPermission>([
  "CREATE_SESSION",
  "EDIT_SESSION",
  "CANCEL_SESSION",
  "MANAGE_ROSTER",
  "MARK_PAID",
  "MARK_ATTENDANCE",
]);

/** Permissions available to Owner and Admin. */
const OWNER_OR_ADMIN_PERMISSIONS = new Set<ClubPermission>([
  ...ALL_ROLES_PERMISSIONS,
  "VIEW_REVENUE",
  "EDIT_CLUB",
  "MANAGE_HOST_MANAGERS",
]);

/** Permissions available to Owner only. */
const OWNER_ONLY_PERMISSIONS = new Set<ClubPermission>([
  ...OWNER_OR_ADMIN_PERMISSIONS,
  "MANAGE_ADMINS",
  "DELETE_CLUB",
  "TRANSFER_OWNERSHIP",
  "CANCEL_SERIES",
]);

function roleHasPermission(role: ClubRole, permission: ClubPermission): boolean {
  if (role === ClubRole.OWNER) return OWNER_ONLY_PERMISSIONS.has(permission);
  if (role === ClubRole.ADMIN) return OWNER_OR_ADMIN_PERMISSIONS.has(permission);
  if (role === ClubRole.HOST_MANAGER) return ALL_ROLES_PERMISSIONS.has(permission);
  return false;
}

/**
 * Returns true if the given player has the requested permission in the club.
 * Performs a single DB lookup and evaluates the permission matrix in memory.
 */
export async function can(
  playerProfileId: string,
  clubId: string,
  permission: ClubPermission,
): Promise<boolean> {
  const row = await prisma.appClubManager.findFirst({
    where: { appClubId: clubId, playerProfileId },
    select: { role: true },
  });
  if (!row) return false;
  return roleHasPermission(row.role, permission);
}

/**
 * Returns the ClubRole of the player in the club, or null if they are not a manager.
 */
export async function getClubRole(
  playerProfileId: string,
  clubId: string,
): Promise<ClubRole | null> {
  const row = await prisma.appClubManager.findFirst({
    where: { appClubId: clubId, playerProfileId },
    select: { role: true },
  });
  return row?.role ?? null;
}

/** True if the player is any kind of manager (any role). */
export async function isAnyManager(
  playerProfileId: string,
  clubId: string,
): Promise<boolean> {
  const row = await prisma.appClubManager.findFirst({
    where: { appClubId: clubId, playerProfileId },
    select: { id: true },
  });
  return row !== null;
}

/** True only if the player is the Owner. */
export async function isOwner(
  playerProfileId: string,
  clubId: string,
): Promise<boolean> {
  const row = await prisma.appClubManager.findFirst({
    where: { appClubId: clubId, playerProfileId, role: ClubRole.OWNER },
    select: { id: true },
  });
  return row !== null;
}

/** True if the player is Owner or Admin. */
export async function isOwnerOrAdmin(
  playerProfileId: string,
  clubId: string,
): Promise<boolean> {
  const row = await prisma.appClubManager.findFirst({
    where: {
      appClubId: clubId,
      playerProfileId,
      role: { in: [ClubRole.OWNER, ClubRole.ADMIN] },
    },
    select: { id: true },
  });
  return row !== null;
}
