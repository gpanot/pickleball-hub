/**
 * GET /api/clubs/mine
 * Returns the current user's top 3 ranked clubs (by weighted score).
 * Auth: required (JWT / reclubUserId).
 *
 * Response:
 *   { top: RankedClub[], hasMore: boolean, totalCount: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.reclubUserId) return NextResponse.json({ top: [], hasMore: false, totalCount: 0 });

  const userId = user.reclubUserId;

  const [rows, totalCount] = await Promise.all([
    prisma.playerClubRank.findMany({
      where: { userId },
      orderBy: [{ weightedScore: "desc" }, { lastSessionAt: "desc" }],
      take: 3,
      include: {
        appClub: {
          select: {
            id: true,
            name: true,
            coverImageUrl: true,
            vibeTag: true,
            tagline: true,
          },
        },
      },
    }),
    prisma.playerClubRank.count({ where: { userId } }),
  ]);

  const top = rows.map((r) => ({
    rank: r.rank ?? null,
    appClubId: r.appClubId,
    name: r.appClub.name,
    logoUrl: r.appClub.coverImageUrl ?? null,
    district: null, // district not stored on AppClub yet — placeholder
    vibeTag: r.appClub.vibeTag ?? null,
    sessionCount: r.sessionCount,
    lastSessionAt: r.lastSessionAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ top, hasMore: totalCount > 3, totalCount });
}
