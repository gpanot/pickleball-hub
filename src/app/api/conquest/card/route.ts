import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { refreshSquadCardStateCache } from "@/lib/conquest/card-recompute";
import { calculateCardPower } from "@/lib/conquest/inf-engine";

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null },
    select: { squadId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not in a squad" }, { status: 403 });
  }

  let cardState = await prisma.squadCardState.findUnique({
    where: { squadId: membership.squadId },
  });

  const isStale = !cardState || (Date.now() - cardState.lastComputedAt.getTime() > ONE_HOUR_MS);

  if (isStale) {
    await refreshSquadCardStateCache(prisma, membership.squadId);
    cardState = await prisma.squadCardState.findUnique({
      where: { squadId: membership.squadId },
    });
  }

  if (!cardState) {
    const power = calculateCardPower({ venuesOwned: 0, squadLevel: 1, activeMembersThisWeek: 0 });
    return NextResponse.json({
      cardPowerInf: power,
      breakdown: {
        venuesOwned: 0,
        venueBonus: 0,
        activeMembersThisWeek: 0,
        memberBonus: 0,
        squadLevel: 1,
        levelMultiplier: 1.05,
      },
    });
  }

  const venueBonus = Math.min(cardState.venuesOwnedCount, 3) * 50;
  const memberBonus = Math.min(cardState.activeMembersThisWeek, 8) * 30;

  return NextResponse.json({
    cardPowerInf: cardState.cardPowerInf,
    breakdown: {
      venuesOwned: cardState.venuesOwnedCount,
      venueBonus,
      activeMembersThisWeek: cardState.activeMembersThisWeek,
      memberBonus,
      squadLevel: Number(cardState.cardLevelMultiplier),
      levelMultiplier: Number(cardState.cardLevelMultiplier),
    },
  });
}
