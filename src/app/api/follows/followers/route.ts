import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";

/**
 * GET /api/follows/followers
 * Returns the list of players who follow the current user.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { reclubUserId: true },
  });

  if (!profile?.reclubUserId) {
    return NextResponse.json({ count: 0, followers: [] });
  }

  const follows = await prisma.follow.findMany({
    where: { followeeId: profile.reclubUserId },
    include: {
      follower: {
        select: {
          id: true,
          displayName: true,
          reclubUserId: true,
          reclubPlayer: {
            select: { imageUrl: true, duprDoubles: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const followers = follows.map((f) => ({
    userId: f.follower.reclubUserId?.toString() ?? f.follower.id,
    displayName: f.follower.displayName,
    imageUrl: f.follower.reclubPlayer?.imageUrl ?? (f.follower.reclubUserId ? reclubAvatarUrl(f.follower.reclubUserId) : null),
    duprDoubles: f.follower.reclubPlayer?.duprDoubles ? Number(f.follower.reclubPlayer.duprDoubles) : null,
    followedAt: f.createdAt.toISOString(),
  }));

  return NextResponse.json({ count: followers.length, followers });
}
