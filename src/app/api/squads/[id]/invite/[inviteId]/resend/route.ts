import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { MAX_SQUAD_MEMBERS } from "@/lib/squad-constants";

/** POST /api/squads/:id/invite/:inviteId/resend — founder resends a pending invite. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId, inviteId } = await params;
  const inviteIdNum = parseInt(inviteId, 10);

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    include: { members: { where: { leftAt: null } } },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }

  const invite = await prisma.squadInvite.findFirst({
    where: { id: inviteIdNum, squadId },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Only pending invites can be resent" }, { status: 409 });
  }

  if (!invite.inviteeId) {
    return NextResponse.json({ error: "Cannot resend link-only invites" }, { status: 400 });
  }

  const founderProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { displayName: true },
  });

  const invitee = await prisma.playerProfile.findUnique({
    where: { id: invite.inviteeId },
    select: { pushToken: true, pushTokenIos: true },
  });

  await prisma.squadInvite.update({
    where: { id: inviteIdNum },
    data: { lastResentAt: new Date() },
  });

  if (invitee?.pushToken || invitee?.pushTokenIos) {
    await sendPushNotification(invite.inviteeId, {
      title: "Squad Invite",
      body: `${founderProfile?.displayName ?? "Someone"} invited you to join ${squad.emoji} ${squad.name} · ${squad.members.length}/${MAX_SQUAD_MEMBERS} members`,
      data: {
        screen: "SquadInviteReceive",
        squadId: squad.id,
        type: "squad_invite",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
