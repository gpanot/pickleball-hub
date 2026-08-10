/**
 * GET /api/clubs/mine
 * Returns the current user's top 3 ranked clubs.
 *
 * Source priority:
 *   1. player_club_ranks (weighted by session history — updated by pn6 cron)
 *   2. app_club_managers (clubs the user manages — shown immediately on creation)
 *
 * Ranked clubs appear first (ordered by score). Managed-only clubs (no session
 * history yet) are appended after, deduplicated by appClubId.
 *
 * Response: { top: RankedClub[], hasMore: boolean, totalCount: number }
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

interface RankedClub {
  rank: number | null;
  appClubId: string;
  name: string;
  logoUrl: string | null;
  district: null;
  vibeTag: string | null;
  sessionCount: number;
  lastSessionAt: string | null;
}

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch both sources in parallel
  const [rankRows, managedRows] = await Promise.all([
    // Source 1: session-history-derived ranks (only if reclubUserId is set)
    user.reclubUserId
      ? prisma.playerClubRank.findMany({
          where: { userId: user.reclubUserId },
          orderBy: [{ weightedScore: "desc" }, { lastSessionAt: "desc" }],
          include: { appClub: { select: CLUB_SELECT } },
        })
      : Promise.resolve([]),

    // Source 2: clubs the user manages (shown even before any sessions)
    prisma.appClubManager.findMany({
      where: { playerProfileId: user.profileId },
      select: {
        appClubId: true,
        appClub: { select: CLUB_SELECT },
      },
    }),
  ]);

  // Merge: ranked clubs first, then unranked managed clubs
  const seenIds = new Set<string>();
  const merged: RankedClub[] = [];

  for (const r of rankRows) {
    seenIds.add(r.appClubId);
    merged.push({
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
    if (seenIds.has(m.appClubId)) continue; // already in ranked list
    merged.push({
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

  const totalCount = merged.length;
  const top = merged.slice(0, 3);

  return NextResponse.json({ top, hasMore: totalCount > 3, totalCount });
}
