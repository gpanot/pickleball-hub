import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reclubAvatarUrl } from "@/lib/utils";

/**
 * GET /api/players/search?q=<query>
 *
 * Searches players by displayName or username (case-insensitive, prefix + contains).
 * Returns top 10 matches. Requires at least 2 characters.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const players = await prisma.player.findMany({
    where: {
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      userId: true,
      displayName: true,
      username: true,
      imageUrl: true,
      duprDoubles: true,
    },
    take: 10,
    orderBy: { lastSeenAt: "desc" },
  });

  const reclubIds = players.map((p) => p.userId);
  const profiles = await prisma.playerProfile.findMany({
    where: { reclubUserId: { in: reclubIds } },
    select: { id: true, reclubUserId: true },
  });
  const profileIds = profiles.map((p) => p.id);
  const inSquad = new Set(
    (
      await prisma.squadMember.findMany({
        where: { profileId: { in: profileIds }, leftAt: null },
        select: { profileId: true },
      })
    ).map((m) => m.profileId),
  );
  const profileByReclubId = new Map(
    profiles.map((p) => [
      p.reclubUserId!.toString(),
      { profileId: p.id, hasSquad: inSquad.has(p.id) },
    ]),
  );

  return NextResponse.json(
    players.map((p) => {
      const reclubId = p.userId.toString();
      const linked = profileByReclubId.get(reclubId);
      return {
        userId: reclubId,
        profileId: linked?.profileId ?? null,
        hasSquad: linked?.hasSquad ?? false,
        displayName: p.displayName,
        username: p.username,
        imageUrl: p.imageUrl ?? reclubAvatarUrl(p.userId),
        duprDoubles: p.duprDoubles ? Number(p.duprDoubles) : null,
      };
    }),
  );
}
