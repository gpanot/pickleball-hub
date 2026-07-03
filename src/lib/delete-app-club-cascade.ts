import type { Prisma } from "@prisma/client";

/**
 * Hard-delete an AppClub and all dependent rows (sessions, bookings, members, managers).
 * Used by profile delete and DELETE /api/app-clubs/[id].
 */
export async function deleteAppClubsCascade(
  tx: Prisma.TransactionClient,
  clubIds: string[]
): Promise<void> {
  if (clubIds.length === 0) return;

  const sessions = await tx.clubSession.findMany({
    where: { appClubId: { in: clubIds } },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  if (sessionIds.length > 0) {
    await tx.clubSessionBooking.deleteMany({
      where: { clubSessionId: { in: sessionIds } },
    });
    await tx.clubSession.deleteMany({ where: { id: { in: sessionIds } } });
  }

  await tx.appClubMember.deleteMany({ where: { appClubId: { in: clubIds } } });
  await tx.appClubManager.deleteMany({ where: { appClubId: { in: clubIds } } });
  await tx.appClub.deleteMany({ where: { id: { in: clubIds } } });
}
