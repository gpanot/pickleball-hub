/**
 * GET /api/clubs/mine/all
 * Returns all of the current user's ranked clubs, up to 10.
 * Auth: required (JWT / reclubUserId).
 *
 * Response: same shape as /api/clubs/mine but `clubs` array (no `top` key).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.reclubUserId) return NextResponse.json({ clubs: [] });

  const userId = user.reclubUserId;

  const rows = await prisma.playerClubRank.findMany({
    where: { userId },
    orderBy: [{ weightedScore: "desc" }, { lastSessionAt: "desc" }],
    take: 10,
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
  });

  const clubs = rows.map((r) => ({
    rank: r.rank ?? null,
    appClubId: r.appClubId,
    name: r.appClub.name,
    logoUrl: r.appClub.coverImageUrl ?? null,
    district: null,
    vibeTag: r.appClub.vibeTag ?? null,
    sessionCount: r.sessionCount,
    lastSessionAt: r.lastSessionAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ clubs });
}
