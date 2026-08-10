/**
 * Club ranking helpers.
 *
 * Auto club membership is derived entirely from session history — players never
 * join manually. After every session confirmation (pn6 cron) this module:
 *   1. Finds the AppClub linked to the session's venue
 *   2. Recomputes the player's weighted score for that club
 *   3. Upserts / deletes player_club_ranks and refreshes the rank column
 */
import { prisma } from "@/lib/db";

/**
 * Weighted score for a player at a club over the last 90 days:
 *   last 30 days  → +3 per session
 *   31–60 days    → +2
 *   61–90 days    → +1
 *   >90 days      → 0 (not included)
 */
export function computeClubScore(sessions: Array<{ date: Date }>): number {
  const now = new Date();
  let score = 0;
  for (const s of sessions) {
    const daysAgo = Math.floor(
      (now.getTime() - s.date.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysAgo <= 30) score += 3;
    else if (daysAgo <= 60) score += 2;
    else if (daysAgo <= 90) score += 1;
  }
  return score;
}

/**
 * Upserts the player_club_ranks row for a (userId, appClubId) pair.
 *
 * Steps:
 *   1. Find all venue IDs associated with the AppClub (via club_sessions)
 *   2. Fetch confirmed scraped sessions for the user at those venues, last 90 days
 *   3. Compute weighted score
 *   4a. score > 0 → upsert row, then rerank all clubs for this user in a transaction
 *   4b. score = 0 → delete the row (club drops off naturally)
 */
export async function upsertPlayerClubRank(
  userId: bigint,
  appClubId: string
): Promise<void> {
  // Step 1 — venue IDs used by this AppClub
  const clubVenueRows = await prisma.clubSession.findMany({
    where: { appClubId, venueId: { not: null } },
    select: { venueId: true },
    distinct: ["venueId"],
  });
  const venueIds = clubVenueRows
    .map((r) => r.venueId)
    .filter((v): v is number => v !== null);

  if (venueIds.length === 0) return; // club has no venue-linked sessions yet

  // Step 2 — confirmed scraped sessions for this user at those venues, last 90d
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const ninetyAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

  const rosterRows = await prisma.sessionRoster.findMany({
    where: {
      userId,
      isConfirmed: true,
      session: {
        venueId: { in: venueIds },
        scrapedDate: { gte: ninetyAgoStr },
      },
    },
    select: {
      session: { select: { startTime: true, scrapedDate: true } },
    },
    orderBy: [
      { session: { scrapedDate: "desc" } },
      { session: { startTime: "desc" } },
    ],
  });

  // Step 3 — compute score
  // startTime is "HH:MM" string; scrapedDate is "YYYY-MM-DD"
  const sessionDates = rosterRows.map((r) => ({
    date: new Date(`${r.session.scrapedDate}T${r.session.startTime}:00+07:00`),
  }));
  const score = computeClubScore(sessionDates);
  const sessionCount = rosterRows.length;
  const lastSessionAt =
    sessionDates.length > 0 ? sessionDates[0].date : null;

  // Step 4a — delete if score dropped to 0
  if (score === 0) {
    await prisma.playerClubRank.deleteMany({
      where: { userId, appClubId },
    });
    return;
  }

  // Step 4b — upsert, then rerank all clubs for this user
  await prisma.$transaction(async (tx) => {
    await tx.playerClubRank.upsert({
      where: { userId_appClubId: { userId, appClubId } },
      create: {
        userId,
        appClubId,
        weightedScore: score,
        sessionCount,
        lastSessionAt,
        updatedAt: new Date(),
      },
      update: {
        weightedScore: score,
        sessionCount,
        lastSessionAt,
        updatedAt: new Date(),
      },
    });

    // Recompute rank ordering for all clubs of this user
    const allRanks = await tx.playerClubRank.findMany({
      where: { userId },
      orderBy: [{ weightedScore: "desc" }, { lastSessionAt: "desc" }],
      select: { id: true },
    });

    for (let i = 0; i < allRanks.length; i++) {
      await tx.playerClubRank.update({
        where: { id: allRanks[i].id },
        data: { rank: i + 1 },
      });
    }
  });
}
