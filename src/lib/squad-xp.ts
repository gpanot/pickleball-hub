import { PrismaClient } from "@prisma/client";

export const LEVEL_THRESHOLDS = [0, 300, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];

export function getLevelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  // Level 10+ = previous threshold + 4000 XP per level
  if (xp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) {
    let threshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    level = LEVEL_THRESHOLDS.length;
    while (true) {
      threshold += 4000;
      if (xp >= threshold) level++;
      else break;
    }
  }
  return level;
}

export function getXpForNextLevel(currentXp: number): { current: number; threshold: number; progress: number } {
  const level = getLevelFromXp(currentXp);
  let prevThreshold = 0;
  let nextThreshold = 300;

  if (level <= LEVEL_THRESHOLDS.length) {
    prevThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
    nextThreshold = LEVEL_THRESHOLDS[level] ?? (prevThreshold + 4000);
  } else {
    prevThreshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - LEVEL_THRESHOLDS.length) * 4000;
    nextThreshold = prevThreshold + 4000;
  }

  const progressXp = currentXp - prevThreshold;
  const rangeXp = nextThreshold - prevThreshold;
  return {
    current: progressXp,
    threshold: rangeXp,
    progress: rangeXp > 0 ? Math.min(1, progressXp / rangeXp) : 0,
  };
}

export type XpSource =
  | "checkin"
  | "scraper_session"
  | "chest"
  | "new_member"
  | "streak";

export const XP_AMOUNTS: Record<XpSource, number> = {
  checkin: 60,
  scraper_session: 80,
  chest: 50,
  new_member: 40,
  streak: 20,
};

/** Squad-wide streak bonus awarded once per day when the streak increments (cron). */
export const STREAK_DAILY_XP = XP_AMOUNTS.streak;

/** Chest open XP/kudos — randomized per open */
export const EARNER_CHEST_XP_MIN = 30;
export const EARNER_CHEST_XP_MAX = 80;
export const EARNER_CHEST_KUDOS = 12;
export const CONTRIBUTOR_CHEST_XP_MIN = 10;
export const CONTRIBUTOR_CHEST_XP_MAX = 30;
export const CONTRIBUTOR_CHEST_KUDOS = 8;

export function rollChestXp(isEarner: boolean): number {
  const min = isEarner ? EARNER_CHEST_XP_MIN : CONTRIBUTOR_CHEST_XP_MIN;
  const max = isEarner ? EARNER_CHEST_XP_MAX : CONTRIBUTOR_CHEST_XP_MAX;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check if a player has ever received new_member XP in any squad.
 * Returns true if they already got it — prevents rejoin XP farming.
 */
export async function hasReceivedNewMemberXp(
  prisma: PrismaClient,
  profileId: string
): Promise<boolean> {
  const existing = await prisma.squadXpLog.findFirst({
    where: { profileId, source: "new_member" },
    select: { id: true },
  });
  return existing !== null;
}

export async function awardSquadXp(
  prisma: PrismaClient,
  squadId: string,
  profileId: string | null,
  source: XpSource,
  amount: number
) {
  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { totalXp: true },
  });
  if (!squad) return;

  const newTotalXp = squad.totalXp + amount;
  const newLevel = getLevelFromXp(newTotalXp);

  await prisma.$transaction([
    prisma.squadXpLog.create({
      data: { squadId, profileId, source, xpAmount: amount },
    }),
    prisma.squad.update({
      where: { id: squadId },
      data: { totalXp: newTotalXp, level: newLevel },
    }),
  ]);
}
