import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // getMobileUser already resolved reclubUserId — no extra profile fetch needed
  const [followingCount, kudosGroups] = await Promise.all([
    prisma.follow.count({ where: { followerId: user.profileId } }),
    user.reclubUserId
      ? prisma.kudos.groupBy({
          by: ["type"],
          where: { toPlayerId: user.reclubUserId },
          _count: { type: true },
        })
      : Promise.resolve([] as Array<{ type: string; _count: { type: number } }>),
  ]);

  const kudosMap: Record<string, number> = {};
  for (const g of kudosGroups) kudosMap[g.type] = g._count.type;

  return NextResponse.json({
    followingCount,
    kudosFistbump: kudosMap["fistbump"] ?? 0,
    kudosFlame: kudosMap["flame"] ?? 0,
    kudosStar: kudosMap["star"] ?? 0,
  });
}
