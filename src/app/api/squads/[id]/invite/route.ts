import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { MAX_SQUAD_MEMBERS } from "@/lib/squad-constants";

async function sendInvitePush(
  inviteeId: string,
  squad: { id: string; emoji: string; name: string },
  memberCount: number,
  founderName: string | null,
  inviteId: number,
) {
  const invitee = await prisma.playerProfile.findUnique({
    where: { id: inviteeId },
    select: { pushToken: true, pushTokenIos: true },
  });

  if (invitee?.pushToken || invitee?.pushTokenIos) {
    await sendPushNotification(inviteeId, {
      title: "Squad Invite",
      body: `${founderName ?? "Someone"} invited you to join ${squad.emoji} ${squad.name} · ${memberCount}/${MAX_SQUAD_MEMBERS} members`,
      data: {
        screen: "SquadInviteReceive",
        squadId: squad.id,
        inviteId: String(inviteId),
        type: "squad_invite",
      },
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId } = await params;

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    include: {
      members: { where: { leftAt: null } },
      code: true,
    },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json({ error: "Only the founder can invite" }, { status: 403 });
  }

  let body: { profileIds?: string[]; notOnAppUserIds?: string[]; podId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { profileIds = [], notOnAppUserIds = [], podId } = body;

  // If a podId was supplied, verify it belongs to this squad and the caller is a member
  if (podId) {
    const pod = await prisma.pod.findFirst({
      where: { id: podId, squadId, disbandedAt: null },
      include: { members: { where: { leftAt: null, profileId: user.profileId } } },
    });
    if (!pod || pod.members.length === 0) {
      return NextResponse.json({ error: "Invalid podId or not a pod member" }, { status: 403 });
    }
  }
  if (profileIds.length === 0 && notOnAppUserIds.length === 0) {
    return NextResponse.json({ error: "profileIds or notOnAppUserIds required" }, { status: 400 });
  }

  const activeMembers = squad.members.length;
  const memberIds = new Set(squad.members.map((m) => m.profileId));

  const existingPending = await prisma.squadInvite.findMany({
    where: { squadId, status: "pending" },
    select: { id: true, inviteeId: true },
  });
  const pendingByInvitee = new Map(
    existingPending
      .filter((i) => i.inviteeId)
      .map((i) => [i.inviteeId!, i.id]),
  );

  const uniqueProfileIds = [...new Set(profileIds)];
  const newInviteeIds = uniqueProfileIds.filter(
    (id) => !pendingByInvitee.has(id) && !memberIds.has(id),
  );

  if (activeMembers + pendingByInvitee.size + newInviteeIds.length > MAX_SQUAD_MEMBERS) {
    return NextResponse.json(
      { error: `Squad would exceed ${MAX_SQUAD_MEMBERS} members` },
      { status: 400 },
    );
  }

  // Resolve display names for not-on-app players (Reclub userId → displayName)
  const uniqueNotOnAppUserIds = [...new Set(notOnAppUserIds)].map((id) => BigInt(id));
  const notOnAppPlayers =
    uniqueNotOnAppUserIds.length > 0
      ? await prisma.player.findMany({
          where: { userId: { in: uniqueNotOnAppUserIds } },
          select: { userId: true, displayName: true },
        })
      : [];
  const notOnAppNameByUserId = new Map(
    notOnAppPlayers.map((p) => [p.userId.toString(), p.displayName]),
  );

  const invited: Array<{ profileId: string; displayName: string | null }> = [];
  const resent: Array<{ profileId: string; displayName: string | null; inviteId: number }> = [];
  const notOnApp: Array<{ userId: string; name: string }> = [];

  const founderProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { displayName: true, squadNickname: true },
  });
  const founderLabel = founderProfile?.squadNickname
    ? `@${founderProfile.squadNickname}`
    : founderProfile?.displayName ?? null;

  for (const profileId of uniqueProfileIds) {
    if (memberIds.has(profileId)) continue;

    const existingInviteId = pendingByInvitee.get(profileId);
    if (existingInviteId) {
      const profile = await prisma.playerProfile.findUnique({
        where: { id: profileId },
        select: { id: true, displayName: true },
      });
      await prisma.squadInvite.update({
        where: { id: existingInviteId },
        data: { lastResentAt: new Date() },
      });
      await sendInvitePush(
        profileId,
        squad,
        activeMembers,
        founderLabel,
        existingInviteId,
      );
      resent.push({
        profileId,
        displayName: profile?.displayName ?? null,
        inviteId: existingInviteId,
      });
      continue;
    }

    const profile = await prisma.playerProfile.findUnique({
      where: { id: profileId },
      select: { id: true, displayName: true },
    });

    if (!profile) {
      // profileId passed but no profile found — skip silently (shouldn't happen normally)
      continue;
    }

    const invite = await prisma.squadInvite.create({
      data: {
        squadId,
        inviterId: user.profileId,
        inviteeId: profile.id,
        inviteChannel: "push",
        status: "pending",
        ...(podId ? { podId } : {}),
      },
    });

    pendingByInvitee.set(profile.id, invite.id);
    invited.push({ profileId: profile.id, displayName: profile.displayName });

    await sendInvitePush(
      profile.id,
      squad,
      activeMembers,
      founderLabel,
      invite.id,
    );
  }

  // Create not_on_app invite records for each Reclub user not yet on SQUADD
  for (const userId of uniqueNotOnAppUserIds) {
    const userIdStr = userId.toString();
    const firstName = notOnAppNameByUserId.get(userIdStr)?.split(" ")[0] ?? null;
    await prisma.squadInvite.create({
      data: {
        squadId,
        inviterId: user.profileId,
        inviteeId: null,
        inviteeName: firstName,
        inviteChannel: "link",
        status: "not_on_app",
      },
    });
    notOnApp.push({
      userId: userIdStr,
      name: firstName ?? userIdStr,
    });
  }

  return NextResponse.json({ invited, resent, notOnApp });
}
