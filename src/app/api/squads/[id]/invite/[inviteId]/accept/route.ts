import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { MAX_SQUAD_MEMBERS } from "@/lib/squad-constants";

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

  await prisma.$transaction([
    prisma.squadMember.create({
      data: {
        squadId,
        profileId: user.profileId,
        role: "member",
      },
    }),
    prisma.squadInvite.update({
      where: { id: inviteIdNum },
      data: { status: "accepted", resolvedAt: new Date() },
    }),
  ]);

  const joinerProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { displayName: true },
  });

  await sendPushNotification(squad.founderId, {
    title: "New Squad Member!",
    body: `${joinerProfile?.displayName ?? "Someone"} joined ${squad.emoji} ${squad.name}!`,
    data: {
      screen: "SquadHome",
      squadId: squad.id,
      type: "squad_join",
    },
  });

  return NextResponse.json({ ok: true });
}
