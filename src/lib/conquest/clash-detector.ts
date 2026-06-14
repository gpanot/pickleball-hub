import { PrismaClient, RadarSession } from "@prisma/client";

/**
 * Detects if a rival squad has an active session at the same venue.
 * If found, marks BOTH sessions as clash-active in a transaction.
 * Returns the rival session or null.
 */
export async function detectClash(
  prisma: PrismaClient,
  venueId: number,
  mySquadId: string,
  mySessionId: string
): Promise<RadarSession | null> {
  const rival = await prisma.radarSession.findFirst({
    where: {
      venueId,
      state: "active",
      squadId: { not: mySquadId },
    },
  });

  if (!rival) return null;

  await prisma.$transaction([
    prisma.radarSession.update({
      where: { id: mySessionId },
      data: { isClashActive: true, clashPartnerSquadId: rival.squadId },
    }),
    prisma.radarSession.update({
      where: { id: rival.id },
      data: { isClashActive: true, clashPartnerSquadId: mySquadId },
    }),
  ]);

  return rival;
}
