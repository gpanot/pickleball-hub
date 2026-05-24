import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

/**
 * DELETE /api/profile/delete
 *
 * Deletes all user data: follows, PlayerProfile, AuthSession, Account, User.
 * Used for GDPR compliance and easier testing.
 */
export async function DELETE(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.$transaction(async (tx) => {
    // Delete kudos sent by this user
    if (user.reclubUserId) {
      await tx.kudos.deleteMany({ where: { fromPlayerId: user.reclubUserId } });
    }

    // Delete follows (where this user is the follower)
    await tx.follow.deleteMany({ where: { followerId: user.profileId } });

    // Delete PlayerProfile
    await tx.playerProfile.deleteMany({ where: { id: user.profileId } });

    // Delete auth sessions
    await tx.authSession.deleteMany({ where: { userId: user.userId } });

    // Delete accounts
    await tx.account.deleteMany({ where: { userId: user.userId } });

    // Delete the User record itself
    await tx.user.deleteMany({ where: { id: user.userId } });
  });

  return NextResponse.json({ ok: true, deleted: true });
}
