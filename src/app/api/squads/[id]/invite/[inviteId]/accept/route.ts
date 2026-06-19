import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { MAX_SQUAD_MEMBERS } from "@/lib/squad-constants";
import { awardSquadXp, XP_AMOUNTS, hasReceivedNewMemberXp } from "@/lib/squad-xp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId, inviteId } = await params;
  const inviteIdNum = parseInt(inviteId, 10);

  const invite = await prisma.squadInvite.findFirst({
    where: { id: inviteIdNum, squadId },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.inviteeId !== user.profileId) {
    return NextResponse.json({ error: "Not your invite" }, { status: 403 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invite already resolved" }, { status: 409 });
  }

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    include: { members: { where: { leftAt: null } } },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.members.length >= MAX_SQUAD_MEMBERS) {
    return NextResponse.json({ error: "Squad is full" }, { status: 400 });
  }

  const existingMembership = await prisma.squadMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      squad: { appSlug: "squadd", disbandedAt: null },
    },
  });

  if (existingMembership) {
    return NextResponse.json({ error: "You are already in a squad" }, { status: 409 });
  }

  const cooldownCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyLeft = await prisma.squadMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: { gt: cooldownCutoff },
    },
    select: { leftAt: true },
    orderBy: { leftAt: "desc" },
  });

  if (recentlyLeft?.leftAt) {
    const cooldownEndsAt = new Date(recentlyLeft.leftAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return NextResponse.json({ error: "cooldown", cooldownEndsAt }, { status: 403 });
  }

  // Resolve the inviter's current Pod in this squad — joiner goes into the same Pod.
  // We look up the inviter's active PodMember row scoped to this squad so we never
  // use a stale podId stored on the invite itself.
  const inviterPodMember = await prisma.podMember.findFirst({
    where: {
      profileId: invite.inviterId,
      leftAt: null,
      pod: { squadId, disbandedAt: null },
    },
    select: { podId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.squadMember.create({
      data: { squadId, profileId: user.profileId, role: "member" },
    });
    await tx.squadInvite.update({
      where: { id: inviteIdNum },
      data: { status: "accepted", resolvedAt: new Date() },
    });

    // Add joiner to the inviter's Pod if one was found and has capacity
    if (inviterPodMember) {
      const { MAX_POD_MEMBERS } = await import("@/lib/pod-constants");
      const podMemberCount = await tx.podMember.count({
        where: { podId: inviterPodMember.podId, leftAt: null },
      });
      if (podMemberCount < MAX_POD_MEMBERS) {
        await tx.podMember.create({
          data: { podId: inviterPodMember.podId, profileId: user.profileId },
        });
      }
    }
  });

  const alreadyGotXp = await hasReceivedNewMemberXp(prisma, user.profileId);
  if (!alreadyGotXp) {
    await awardSquadXp(
      prisma,
      squadId,
      user.profileId,
      "new_member",
      XP_AMOUNTS.new_member
    );
  }

  const joinerProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { displayName: true, squadNickname: true, welcomeChestClaimed: true },
  });

  const joinerLabel = joinerProfile?.squadNickname
    ? `@${joinerProfile.squadNickname}`
    : (joinerProfile?.displayName ?? "Someone");

  await sendPushNotification(squad.founderId, {
    title: "New Squad Member!",
    body: `${joinerLabel} joined ${squad.emoji} ${squad.name}!`,
    data: {
      screen: "SquadHome",
      squadId: squad.id,
      type: "squad_join",
    },
  });

  return NextResponse.json({
    ok: true,
    welcomeChestClaimed: joinerProfile?.welcomeChestClaimed ?? false,
  });
}
