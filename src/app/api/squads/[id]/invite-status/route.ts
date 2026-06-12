import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(
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
    select: { founderId: true },
  });

  if (!squad) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }

  const invites = await prisma.squadInvite.findMany({
    where: { squadId, status: { in: ["pending", "declined", "accepted", "not_on_app"] } },
    orderBy: { createdAt: "desc" },
  });

  const seenInvitees = new Set<string>();
  const deduped = invites.filter((invite) => {
    if (!invite.inviteeId) return true;
    if (seenInvitees.has(invite.inviteeId)) return false;
    seenInvitees.add(invite.inviteeId);
    return true;
  });

  const inviteIds = deduped
    .map((i) => i.inviteeId)
    .filter((id): id is string => id !== null);

  const profiles = await prisma.playerProfile.findMany({
    where: { id: { in: inviteIds } },
    select: {
      id: true,
      displayName: true,
      reclubPlayer: { select: { imageUrl: true } },
    },
  });

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const enriched = deduped.map((invite) => {
    const profile = invite.inviteeId ? profileMap.get(invite.inviteeId) : null;
    return {
      id: invite.id,
      inviteeId: invite.inviteeId,
      displayName: profile?.displayName ?? invite.inviteeName ?? null,
      avatar: profile?.reclubPlayer?.imageUrl ?? null,
      status: invite.status,
      channel: invite.inviteChannel,
      lastResentAt: invite.lastResentAt,
      createdAt: invite.createdAt,
    };
  });

  return NextResponse.json({ invites: enriched });
}
