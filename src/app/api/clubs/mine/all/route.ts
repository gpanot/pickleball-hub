/**
 * GET /api/clubs/mine/all
 * Returns all of the current user's clubs, up to 10.
 *
 * Source priority (same merge logic as /api/clubs/mine):
 *   1. player_club_ranks — session-history-derived, ordered by weighted score
 *   2. app_club_managers — managed clubs with no session history yet
 *
 * Response: { clubs: RankedClub[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

const CLUB_SELECT = {
  id: true,
  name: true,
  coverImageUrl: true,
  vibeTag: true,
  tagline: true,
} as const;

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [rankRows, managedRows] = await Promise.all([
    user.reclubUserId
      ? prisma.playerClubRank.findMany({
          where: { userId: user.reclubUserId },
          orderBy: [{ weightedScore: "desc" }, { lastSessionAt: "desc" }],
          take: 10,
          include: { appClub: { select: CLUB_SELECT } },
        })
      : Promise.resolve([]),

    prisma.appClubManager.findMany({
      where: { playerProfileId: user.profileId },
      select: {
        appClubId: true,
        appClub: { select: CLUB_SELECT },
      },
    }),
  ]);

  const seenIds = new Set<string>();
  const clubs = [];

  for (const r of rankRows) {
    seenIds.add(r.appClubId);
    clubs.push({
      rank: r.rank ?? null,
      appClubId: r.appClubId,
      name: r.appClub.name,
      logoUrl: r.appClub.coverImageUrl ?? null,
      district: null,
      vibeTag: r.appClub.vibeTag ?? null,
      sessionCount: r.sessionCount,
      lastSessionAt: r.lastSessionAt?.toISOString() ?? null,
    });
  }

  for (const m of managedRows) {
    if (seenIds.has(m.appClubId)) continue;
    if (clubs.length >= 10) break;
    clubs.push({
      rank: null,
      appClubId: m.appClubId,
      name: m.appClub.name,
      logoUrl: m.appClub.coverImageUrl ?? null,
      district: null,
      vibeTag: m.appClub.vibeTag ?? null,
      sessionCount: 0,
      lastSessionAt: null,
    });
  }

  return NextResponse.json({ clubs });
}
