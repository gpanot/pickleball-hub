import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { MAX_SQUAD_MEMBERS } from "@/lib/squad-constants";

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

  let body: { profileIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { profileIds } = body;
  if (!Array.isArray(profileIds) || profileIds.length === 0) {
    return NextResponse.json({ error: "profileIds required" }, { status: 400 });
  }

  const activeMembers = squad.members.length;
  if (activeMembers + profileIds.length > MAX_SQUAD_MEMBERS) {
    return NextResponse.json(
      { error: `Squad would exceed ${MAX_SQUAD_MEMBERS} members` },
      { status: 400 }
    );
  }

  const invited: Array<{ profileId: string; displayName: string | null }> = [];
  const notOnApp: string[] = [];

  const founderProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { displayName: true },
  });

  for (const profileId of profileIds) {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: profileId },
      select: { id: true, displayName: true, pushToken: true, pushTokenIos: true },
    });

    if (!profile) {
      await prisma.squadInvite.create({
        data: {
          squadId,
          inviterId: user.profileId,
          inviteeId: null,
          inviteChannel: "link",
          status: "not_on_app",
        },
      });
      notOnApp.push(profileId);
      continue;
    }

    await prisma.squadInvite.create({
      data: {
        squadId,
        inviterId: user.profileId,
        inviteeId: profile.id,
        inviteChannel: "push",
        status: "pending",
      },
    });

    invited.push({ profileId: profile.id, displayName: profile.displayName });

    if (profile.pushToken || profile.pushTokenIos) {
      await sendPushNotification(profile.id, {
        title: "Squad Invite",
        body: `${founderProfile?.displayName ?? "Someone"} invited you to join ${squad.emoji} ${squad.name} · ${activeMembers}/${MAX_SQUAD_MEMBERS} members`,
        data: {
          screen: "SquadInviteReceive",
          squadId: squad.id,
          type: "squad_invite",
        },
      });
    }
  }

  return NextResponse.json({ invited, notOnApp });
}
