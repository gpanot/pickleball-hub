/**
 * Authorization helpers for Club Sessions — legacy shim.
 *
 * New code should import from @/lib/club-permissions directly.
 * isClubManager() is kept for backward compatibility and maps to isAnyManager()
 * (true for any role: OWNER, ADMIN, HOST_MANAGER).
 */
import { prisma } from "@/lib/db";

/**
 * Returns true if the given playerProfileId has ANY manager role
 * (OWNER, ADMIN, or HOST_MANAGER) in the given appClubId.
 *
 * @deprecated Use can() or isAnyManager() from @/lib/club-permissions instead.
 */
export async function isClubManager(
  appClubId: string,
  playerProfileId: string,
): Promise<boolean> {
  const row = await prisma.appClubManager.findFirst({
    where: { appClubId, playerProfileId },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Given a clubSessionId, returns the parent appClubId so callers can
 * perform the manager check without fetching the full session.
 * Returns null if the session does not exist.
 */
export async function getSessionClubId(
  clubSessionId: string,
): Promise<string | null> {
  const session = await prisma.clubSession.findUnique({
    where: { id: clubSessionId },
    select: { appClubId: true },
  });
  return session?.appClubId ?? null;
}
