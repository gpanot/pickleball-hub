import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { MIN_POD_NAME_LENGTH, MAX_POD_NAME_LENGTH, MAX_POD_MEMBERS } from "@/lib/pod-constants";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { squadId, name, emoji } = body as { squadId?: string; name?: string; emoji?: string };

  if (!squadId || !name || !emoji) {
    return NextResponse.json({ error: "squadId, name and emoji are required" }, { status: 400 });
  }

  const trimmedName = name.trim();
  if (trimmedName.length < MIN_POD_NAME_LENGTH || trimmedName.length > MAX_POD_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Name must be ${MIN_POD_NAME_LENGTH}–${MAX_POD_NAME_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Verify caller is an active member of the squad
  const membership = await prisma.squadMember.findFirst({
    where: { squadId, profileId: user.profileId, leftAt: null },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this squad" }, { status: 403 });
  }

  // Guard: player can only be in one active Pod per Squad
  const existingPodMember = await prisma.podMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      pod: { squadId, disbandedAt: null },
    },
  });
  if (existingPodMember) {
    return NextResponse.json({ error: "Already in a Pod in this squad" }, { status: 409 });
  }

  const pod = await prisma.$transaction(async (tx) => {
    const created = await tx.pod.create({
      data: {
        squadId,
        name: trimmedName,
        emoji,
        founderId: user.profileId,
      },
    });
    await tx.podMember.create({
      data: { podId: created.id, profileId: user.profileId },
    });
    return created;
  });

  const podWithMembers = await prisma.pod.findUnique({
    where: { id: pod.id },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          profile: { select: { id: true, displayName: true, squadNickname: true } },
        },
      },
    },
  });

  return NextResponse.json({
    id: podWithMembers!.id,
    squadId: podWithMembers!.squadId,
    name: podWithMembers!.name,
    emoji: podWithMembers!.emoji,
    founderId: podWithMembers!.founderId,
    members: podWithMembers!.members.map((m) => ({
      profileId: m.profileId,
      displayName: m.profile.squadNickname
        ? `@${m.profile.squadNickname}`
        : m.profile.displayName?.split(" ")[0] ?? "?",
    })),
    maxMembers: MAX_POD_MEMBERS,
  });
}
