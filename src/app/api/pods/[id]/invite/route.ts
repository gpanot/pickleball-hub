import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { MAX_POD_MEMBERS } from "@/lib/pod-constants";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: podId } = await params;
  const body = await req.json();
  const { inviteeId } = body as { inviteeId?: string };

  if (!inviteeId) {
    return NextResponse.json({ error: "inviteeId is required" }, { status: 400 });
  }

  const pod = await prisma.pod.findUnique({
    where: { id: podId },
    include: {
      members: { where: { leftAt: null } },
    },
  });
  if (!pod || pod.disbandedAt) {
    return NextResponse.json({ error: "Pod not found" }, { status: 404 });
  }

  // Only pod founder (or squad founder) can invite
  const isMember = pod.members.some((m) => m.profileId === user.profileId);
  if (!isMember) {
    return NextResponse.json({ error: "Not a member of this Pod" }, { status: 403 });
  }

  // Check pod capacity
  if (pod.members.length >= MAX_POD_MEMBERS) {
    return NextResponse.json({ error: "Pod is full" }, { status: 409 });
  }

  // Invitee must be in the same squad
  const squadMembership = await prisma.squadMember.findFirst({
    where: { squadId: pod.squadId, profileId: inviteeId, leftAt: null },
  });
  if (!squadMembership) {
    return NextResponse.json({ error: "Invitee is not in your squad" }, { status: 422 });
  }

  // Prevent duplicate invite
  const existing = await prisma.squadInvite.findFirst({
    where: { podId, inviteeId, status: "pending" },
  });
  if (existing) {
    return NextResponse.json({ error: "Invite already pending" }, { status: 409 });
  }

  const invite = await prisma.squadInvite.create({
    data: {
      squadId: pod.squadId,
      inviterId: user.profileId,
      inviteeId,
      inviteChannel: "push",
      podId,
    },
  });

  return NextResponse.json({ inviteId: invite.id });
}
