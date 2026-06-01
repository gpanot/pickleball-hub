import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";

/**
 * GET /api/kudos/givers?toPlayerId=xxx
 * Returns the list of players who gave kudos to the specified player.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const toPlayerId = req.nextUrl.searchParams.get("toPlayerId");
  if (!toPlayerId) {
    return NextResponse.json({ error: "toPlayerId required" }, { status: 400 });
  }

  const kudos = await prisma.kudos.findMany({
    where: { toPlayerId: BigInt(toPlayerId) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const givers = await Promise.all(
    kudos.map(async (k) => {
      const profile = await prisma.playerProfile.findUnique({
        where: { id: k.fromPlayerId },
        select: { displayName: true, reclubUserId: true },
      });
      let imageUrl: string | null = null;
      if (profile?.reclubUserId) {
        const player = await prisma.player.findUnique({
          where: { userId: profile.reclubUserId },
          select: { imageUrl: true },
        });
        imageUrl = player?.imageUrl ?? reclubAvatarUrl(profile.reclubUserId);
      }
      return {
        userId: k.fromPlayerId,
        displayName: profile?.displayName ?? "Player",
        imageUrl,
        type: k.type,
        givenAt: k.createdAt.toISOString(),
      };
    })
  );

  return NextResponse.json({ givers });
}
