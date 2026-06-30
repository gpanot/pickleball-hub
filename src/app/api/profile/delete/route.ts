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

  console.log(`[DELETE /api/profile/delete] START pid=${pid} uid=${uid}`);

  const step = (name: string) => console.log(`[DELETE /api/profile/delete] step: ${name}`);

  try {
    await prisma.$transaction(async (tx) => {
      step("venuePulseCooldown");
      await tx.venuePulseCooldown.deleteMany({ where: { playerId: pid } });

      step("radarSession(player)");
      await tx.radarSession.deleteMany({ where: { playerId: pid } });

      step("squadAlert(recipient)");
      await tx.squadAlert.deleteMany({ where: { recipientProfileId: pid } });

      step("squadChestOpening");
      await tx.squadChestOpening.deleteMany({ where: { profileId: pid } });

      step("podMember(profile)");
      await tx.podMember.deleteMany({ where: { profileId: pid } });

      step("squadInvite");
      await tx.squadInvite.deleteMany({ where: { inviterId: pid } });

      step("squadChest");
      await tx.squadChest.deleteMany({ where: { earnerId: pid } });

      step("squadMember");
      await tx.squadMember.deleteMany({ where: { profileId: pid } });

      step("foundedSquads — find");
      const foundedSquads = await tx.squad.findMany({
        where: { founderId: pid },
        select: { id: true },
      });
      const foundedSquadIds = foundedSquads.map((s) => s.id);
      console.log(`[DELETE /api/profile/delete] foundedSquads count=${foundedSquadIds.length}`);

      if (foundedSquadIds.length > 0) {
        step("squadAlert(squad)");
        await tx.squadAlert.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
        step("squadCardState");
        await tx.squadCardState.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
        step("venueInfTotal");
        await tx.venueInfTotal.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
        step("cardBattle");
        await tx.cardBattle.deleteMany({
          where: {
            OR: [
              { initiatingSquadId: { in: foundedSquadIds } },
              { rivalSquadId: { in: foundedSquadIds } },
            ],
          },
        });
        step("radarSession(squad)");
        await tx.radarSession.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
        step("podMember(squad)");
        await tx.podMember.deleteMany({ where: { pod: { squadId: { in: foundedSquadIds } } } });
        step("pod(squad)");
        await tx.pod.deleteMany({ where: { squadId: { in: foundedSquadIds } } });
        step("squad.deleteMany");
        await tx.squad.deleteMany({ where: { id: { in: foundedSquadIds } } });
      }

      step("podMember(founderPods)");
      await tx.podMember.deleteMany({ where: { pod: { founderId: pid } } });
      step("pod(founder)");
      await tx.pod.deleteMany({ where: { founderId: pid } });

      step("playerWallet");
      await tx.playerWallet.deleteMany({ where: { profileId: pid } });
      step("playerBrand");
      await tx.playerBrand.deleteMany({ where: { profileId: pid } });

      step("kudos");
      await tx.kudos.deleteMany({ where: { fromPlayerId: pid } });
      step("follow");
      await tx.follow.deleteMany({ where: { followerId: pid } });
      step("block");
      await tx.block.deleteMany({ where: { OR: [{ blockerId: pid }, { blockedId: pid }] } });
      step("report");
      await tx.report.deleteMany({ where: { OR: [{ reporterId: pid }, { reportedId: pid }] } });
      step("playIntent");
      await tx.playIntent.deleteMany({ where: { profileId: pid } });
      step("feedItem");
      await tx.feedItem.deleteMany({ where: { profileId: pid } });
      step("notificationSent");
      await tx.notificationSent.deleteMany({ where: { OR: [{ recipientId: pid }, { senderId: pid }] } });
      step("playerGear");
      await tx.playerGear.deleteMany({ where: { profileId: pid } });

      // ── Club Sessions ─────────────────────────────────────────────────────────
      step("clubSessionBooking(player)");
      await tx.clubSessionBooking.deleteMany({ where: { playerProfileId: pid } });

      step("hostedSessions — find");
      const hostedSessions = await tx.clubSession.findMany({
        where: { hostId: pid },
        select: { id: true },
      });
      const hostedSessionIds = hostedSessions.map((s) => s.id);
      console.log(`[DELETE /api/profile/delete] hostedSessions count=${hostedSessionIds.length}`);

      if (hostedSessionIds.length > 0) {
        step("clubSessionBooking(hostedSessions)");
        await tx.clubSessionBooking.deleteMany({
          where: { clubSessionId: { in: hostedSessionIds } },
        });
        step("clubSession(hosted)");
        await tx.clubSession.deleteMany({ where: { id: { in: hostedSessionIds } } });
      }

      step("appClubMember(player)");
      await tx.appClubMember.deleteMany({ where: { playerProfileId: pid } });
      step("appClubManager(player)");
      await tx.appClubManager.deleteMany({
        where: { OR: [{ playerProfileId: pid }, { addedById: pid }] },
      });

      step("ownedClubs — find");
      const ownedClubs = await tx.appClub.findMany({
        where: { creatorId: pid },
        select: { id: true },
      });
      const ownedClubIds = ownedClubs.map((c) => c.id);
      console.log(`[DELETE /api/profile/delete] ownedClubs count=${ownedClubIds.length}`);

      if (ownedClubIds.length > 0) {
        step("clubSession(ownedClubs) — find");
        const clubSessions = await tx.clubSession.findMany({
          where: { appClubId: { in: ownedClubIds } },
          select: { id: true },
        });
        const clubSessionIds = clubSessions.map((s) => s.id);
        if (clubSessionIds.length > 0) {
          step("clubSessionBooking(ownedClubSessions)");
          await tx.clubSessionBooking.deleteMany({
            where: { clubSessionId: { in: clubSessionIds } },
          });
          step("clubSession(ownedClubs)");
          await tx.clubSession.deleteMany({ where: { id: { in: clubSessionIds } } });
        }
        step("appClubMember(ownedClubs)");
        await tx.appClubMember.deleteMany({ where: { appClubId: { in: ownedClubIds } } });
        step("appClubManager(ownedClubs)");
        await tx.appClubManager.deleteMany({ where: { appClubId: { in: ownedClubIds } } });
        step("appClub.deleteMany");
        await tx.appClub.deleteMany({ where: { id: { in: ownedClubIds } } });
      }
      // ── End Club Sessions ─────────────────────────────────────────────────────

      step("playerProfile");
      await tx.playerProfile.deleteMany({ where: { id: pid } });

      step("authSession");
      await tx.authSession.deleteMany({ where: { userId: uid } });
      step("account");
      await tx.account.deleteMany({ where: { userId: uid } });
      step("user");
      await tx.user.deleteMany({ where: { id: uid } });

      step("DONE");
    }, { timeout: 15000 });

    console.log(`[DELETE /api/profile/delete] SUCCESS pid=${pid}`);
    return NextResponse.json({ ok: true, deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code ?? "unknown";
    const meta = (err as { meta?: unknown }).meta ?? null;
    console.error(
      `[DELETE /api/profile/delete] FAILED pid=${pid} code=${code} message=${message}`,
      meta ? JSON.stringify(meta) : ""
    );
    return NextResponse.json(
      { error: "Delete failed", code, message, meta },
      { status: 500 }
    );
  }
}
