import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

/**
 * DELETE /api/follows/all
 * Removes all follow relationships where the current user is the follower,
 * and deletes all persisted feed items for the user.
 * Called when unlinking a Reclub account so My Feed and Players screens are
 * immediately and permanently empty — even after a restart.
 */
export async function DELETE(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [followResult, feedResult] = await Promise.all([
    prisma.follow.deleteMany({
      where: { followerId: user.profileId },
    }),
    prisma.feedItem.deleteMany({
      where: { profileId: user.profileId },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    deletedFollows: followResult.count,
    deletedFeedItems: feedResult.count,
  });
}
