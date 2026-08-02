/**
 * Auto-grow capacity helper for Club Sessions.
 *
 * When a host enables auto-grow, `max_players` acts as the *current tier* and
 * automatically advances in steps of `capacity_tier_step` up to `capacity_ceiling`
 * each time the confirmed fill ratio hits 80%.
 *
 * All callers pass a Prisma transaction handle so the capacity update is atomic
 * with the roster change that triggered it.
 */
import type { PrismaClient } from "@prisma/client";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Checks fill ratio on the session and bumps `max_players` by one tier if 80%
 * threshold is reached. No-op when auto-grow is disabled or ceiling already met.
 *
 * Must be called inside a Prisma `$transaction` after a booking is set to
 * "confirmed" so the confirmed count is already current.
 */
export async function maybePromoteCapacity(
  tx: TxClient,
  clubSessionId: string,
): Promise<void> {
  const session = await tx.clubSession.findUnique({
    where: { id: clubSessionId },
    select: {
      autoGrowEnabled: true,
      maxPlayers: true,
      capacityCeiling: true,
      capacityTierStep: true,
    },
  });

  if (
    !session ||
    !session.autoGrowEnabled ||
    session.capacityCeiling == null ||
    session.maxPlayers >= session.capacityCeiling
  ) {
    return;
  }

  const confirmedCount = await tx.clubSessionBooking.count({
    where: { clubSessionId, status: "confirmed" },
  });

  const fillRatio = confirmedCount / session.maxPlayers;
  if (fillRatio < 0.8) return;

  const nextCapacity = Math.min(
    session.maxPlayers + session.capacityTierStep,
    session.capacityCeiling,
  );

  if (nextCapacity === session.maxPlayers) return;

  await tx.clubSession.update({
    where: { id: clubSessionId },
    data: { maxPlayers: nextCapacity },
  });
}
