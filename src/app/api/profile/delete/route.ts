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

    // Pods must be deleted before Squads (pods_squad_id_fkey, no cascade in schema)
    // Find squads founded by this user, then delete their pods and the squads
    const foundedSquads = await tx.squad.findMany({
      where: { founderId: pid },
      select: { id: true },
    });
    const foundedSquadIds = foundedSquads.map((s) => s.id);

    if (foundedSquadIds.length > 0) {
      // Delete all Squad-referencing tables that lack onDelete: Cascade
      await tx.squadAlert.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
      await tx.squadCardState.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
      await tx.venueInfTotal.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
      await tx.cardBattle.deleteMany({
        where: {
          OR: [
            { initiatingSquadId: { in: foundedSquadIds } },
            { rivalSquadId: { in: foundedSquadIds } },
          ],
        },
      });
      await tx.radarSession.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
      await tx.podMember.deleteMany({ where: { pod: { squadId: { in: foundedSquadIds } } } });
      await tx.pod.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
      // SquadMember, SquadCode, SquadInvite, SquadChest, SquadXpLog cascade from Squad
      await tx.squad.deleteMany({ where: { id: { in: foundedSquadIds } } });
    }

    // Pods where this user is founder but squad belongs to someone else
    await tx.podMember.deleteMany({ where: { pod: { founderId: pid } } });
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
