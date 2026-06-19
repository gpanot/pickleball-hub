import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { awardSquadXp } from "@/lib/squad-xp";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { squadId, clubTokens } = body as { squadId?: string; clubTokens?: number };

  if (!squadId || typeof clubTokens !== "number") {
    return NextResponse.json({ error: "squadId and clubTokens are required" }, { status: 400 });
  }

  if (clubTokens <= 0) {
    return NextResponse.json({ error: "clubTokens must be positive" }, { status: 400 });
  }

  // Verify active squad membership
  const membership = await prisma.squadMember.findFirst({
    where: { squadId, profileId: user.profileId, leftAt: null },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this squad" }, { status: 403 });
  }

  // Fetch wallet and check balance
  const wallet = await prisma.playerWallet.findUnique({
    where: { profileId: user.profileId },
  });
  if (!wallet || wallet.clubTokens < clubTokens) {
    return NextResponse.json({ error: "Insufficient club tokens" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.playerWallet.update({
      where: { profileId: user.profileId },
      data: { clubTokens: { decrement: clubTokens } },
    });
    await tx.tokenLedger.create({
      data: {
        profileId: user.profileId,
        tokenType: "club",
        delta: -clubTokens,
        reason: "donate_to_squad",
        squadId,
      },
    });
  });

  // Award squad XP: 1 token = 1 XP, outside the wallet transaction so squad level update is visible
  await awardSquadXp(prisma, squadId, user.profileId, "donation", clubTokens);

  const [updatedWallet, squad] = await Promise.all([
    prisma.playerWallet.findUnique({ where: { profileId: user.profileId } }),
    prisma.squad.findUnique({ where: { id: squadId }, select: { totalXp: true, level: true } }),
  ]);

  return NextResponse.json({
    clubTokens: updatedWallet?.clubTokens ?? 0,
    brandTokens: updatedWallet?.brandTokens ?? 0,
    squadLevel: squad?.level ?? 1,
    squadXp: squad?.totalXp ?? 0,
  });
}
