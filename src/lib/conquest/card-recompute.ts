import { PrismaClient } from "@prisma/client";
import { calculateCardPower } from "./inf-engine";

/**
 * Computes card power fresh from DB — called at battle initiation and by cron.
 * NOT from cache. Returns the INF bonus value.
 */
export async function computeCardPower(
  prisma: PrismaClient,
  squadId: string
): Promise<number> {
  const [squad, venuesOwnedResult, activeMembers] = await Promise.all([
    prisma.squad.findUnique({ where: { id: squadId }, select: { level: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM venue_inf_totals vit
      WHERE vit.squad_id = ${squadId}
      AND vit.total_inf = (
        SELECT MAX(v2.total_inf) FROM venue_inf_totals v2 WHERE v2.venue_id = vit.venue_id
      )
    `,
    prisma.radarSession.findMany({
      where: {
        squadId,
        startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
  ]);

  return calculateCardPower({
    venuesOwned: Number(venuesOwnedResult[0]?.count ?? 0),
    squadLevel: squad?.level ?? 1,
    activeMembersThisWeek: activeMembers.length,
  });
}

/**
 * Refreshes the SquadCardState cache row for a squad.
 */
export async function refreshSquadCardStateCache(
  prisma: PrismaClient,
  squadId: string
): Promise<void> {
  const [squad, venuesOwnedResult, activeMembers] = await Promise.all([
    prisma.squad.findUnique({ where: { id: squadId }, select: { level: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM venue_inf_totals vit
      WHERE vit.squad_id = ${squadId}
      AND vit.total_inf = (
        SELECT MAX(v2.total_inf) FROM venue_inf_totals v2 WHERE v2.venue_id = vit.venue_id
      )
    `,
    prisma.radarSession.findMany({
      where: {
        squadId,
        startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
  ]);

  const venuesOwned = Number(venuesOwnedResult[0]?.count ?? 0);
  const squadLevel = squad?.level ?? 1;
  const activeMembersThisWeek = activeMembers.length;
  const levelMultiplier = 1.0 + squadLevel * 0.05;
  const cardPowerInf = calculateCardPower({ venuesOwned, squadLevel, activeMembersThisWeek });

  await prisma.squadCardState.upsert({
    where: { squadId },
    create: {
      squadId,
      cardPowerInf,
      cardLevelMultiplier: levelMultiplier,
      venuesOwnedCount: venuesOwned,
      activeMembersThisWeek,
      lastComputedAt: new Date(),
    },
    update: {
      cardPowerInf,
      cardLevelMultiplier: levelMultiplier,
      venuesOwnedCount: venuesOwned,
      activeMembersThisWeek,
      lastComputedAt: new Date(),
    },
  });
}
