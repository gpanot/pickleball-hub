import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { MAX_SQUAD_MEMBERS } from "@/lib/squad-constants";
import { awardSquadXp, XP_AMOUNTS, hasReceivedNewMemberXp } from "@/lib/squad-xp";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { code } = body;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
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

  const squadCode = await prisma.squadCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      squad: {
        include: { members: { where: { leftAt: null } } },
      },
    },
  });

  if (!squadCode || squadCode.squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  const { squad } = squadCode;

  if (squad.members.length >= MAX_SQUAD_MEMBERS) {
    return NextResponse.json({ error: "Squad is full" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.squadMember.create({
      data: {
        squadId: squad.id,
        profileId: user.profileId,
        role: "member",
      },
    });

    await tx.squadInvite.updateMany({
      where: {
        squadId: squad.id,
        inviteeId: user.profileId,
        status: "pending",
      },
      data: { status: "accepted", resolvedAt: new Date() },
    });
  });

  const alreadyGotXp = await hasReceivedNewMemberXp(prisma, user.profileId);
  if (!alreadyGotXp) {
    await awardSquadXp(
      prisma,
      squad.id,
      user.profileId,
      "new_member",
      XP_AMOUNTS.new_member
    );
  }

  const updated = await prisma.squad.findUnique({
    where: { id: squad.id },
    include: {
      code: true,
      members: {
        where: { leftAt: null },
        include: {
          profile: {
            select: {
              id: true,
              displayName: true,
              reclubPlayer: { select: { imageUrl: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ squad: updated });
}
