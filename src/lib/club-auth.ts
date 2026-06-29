/**
 * Authorization helpers for Club Sessions.
 *
 * Every mutating endpoint on clubs, sessions, and bookings must call
 * isClubManager() rather than checking AppClub.creatorId directly.
 * The creator's row is seeded into AppClubManager on club creation, so
 * checking AppClubManager covers both the creator and any additional managers.
 */
import { prisma } from "@/lib/db";

/**
 * Returns true if the given playerProfileId is listed as a manager
 * (role "creator" or "manager") on the given appClubId.
 */
export async function isClubManager(
  appClubId: string,
  playerProfileId: string
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
  clubSessionId: string
): Promise<string | null> {
  const session = await prisma.clubSession.findUnique({
    where: { id: clubSessionId },
    select: { appClubId: true },
  });
  return session?.appClubId ?? null;
}
