import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

/**
 * DELETE /api/profile/delete
 *
 * Deletes all user data in dependency order to avoid FK violations.
 * Used for GDPR compliance and in-app "Delete my data" flow.
 */
export async function DELETE(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pid = user.profileId;
  const uid = user.userId;

  await prisma.$transaction(async (tx) => {
    // Leaf records that reference PlayerProfile directly (no cascade in schema)
    await tx.venuePulseCooldown.deleteMany({ where: { playerId: pid } });
    await tx.radarSession.deleteMany({ where: { playerId: pid } });
    await tx.squadAlert.deleteMany({ where: { recipientProfileId: pid } });
    await tx.squadChestOpening.deleteMany({ where: { profileId: pid } });
    await tx.podMember.deleteMany({ where: { profileId: pid } });

    // SquadInvite — user may be the inviter
    await tx.squadInvite.deleteMany({ where: { inviterId: pid } });

    // SquadChest — user may be the earner
    await tx.squadChest.deleteMany({ where: { earnerId: pid } });

    // SquadMember — remove from all squads first
    await tx.squadMember.deleteMany({ where: { profileId: pid } });

    // Squads founded by this user — reassign or disband
    // Simplest GDPR-safe approach: disband by deleting the squad cascade
    // (SquadMember, SquadCode, SquadInvite, SquadChest, SquadXpLog all cascade from Squad)
    await tx.squad.deleteMany({ where: { founderId: pid } });

    // Pods founded by this user
    await tx.pod.deleteMany({ where: { founderId: pid } });

    // Wallet and brand (no cascade)
    await tx.playerWallet.deleteMany({ where: { profileId: pid } });
    await tx.playerBrand.deleteMany({ where: { profileId: pid } });

    // Social / activity records
    await tx.kudos.deleteMany({ where: { fromPlayerId: pid } });
    await tx.follow.deleteMany({ where: { followerId: pid } });
    await tx.block.deleteMany({ where: { OR: [{ blockerId: pid }, { blockedId: pid }] } });
    await tx.report.deleteMany({ where: { OR: [{ reporterId: pid }, { reportedId: pid }] } });
    await tx.playIntent.deleteMany({ where: { profileId: pid } });
    await tx.feedItem.deleteMany({ where: { profileId: pid } });
    await tx.notificationSent.deleteMany({ where: { OR: [{ recipientId: pid }, { senderId: pid }] } });
    await tx.playerGear.deleteMany({ where: { profileId: pid } });

    // PlayerProfile itself
    await tx.playerProfile.deleteMany({ where: { id: pid } });

    // Auth layer
    await tx.authSession.deleteMany({ where: { userId: uid } });
    await tx.account.deleteMany({ where: { userId: uid } });
    await tx.user.deleteMany({ where: { id: uid } });
  }, { timeout: 15000 });

  return NextResponse.json({ ok: true, deleted: true });
}
