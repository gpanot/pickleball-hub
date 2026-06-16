import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.radarSession.findFirst({
    where: { playerId: user.profileId, state: "active" },
    include: {
      venue: { select: { id: true, name: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ session: null });
  }

  const copresentCount = await prisma.radarSession.count({
    where: {
      venueId: session.venueId,
      squadId: session.squadId,
      state: "active",
    },
  });

  let clashPartnerSquadName: string | null = null;
  if (session.clashPartnerSquadId) {
    const rival = await prisma.squad.findUnique({
      where: { id: session.clashPartnerSquadId },
      select: { name: true },
    });
    clashPartnerSquadName = rival?.name ?? null;
  }

  const now = new Date();
  const secondsRemaining = Math.max(
    0,
    Math.floor((session.autoEndsAt.getTime() - now.getTime()) / 1000)
  );

  // Include any active (unrevealed or just-revealed) battle for this squad at this venue
  // so the client can restore battle state after an app restart
  const activeBattleRecord = await prisma.cardBattle.findFirst({
    where: {
      venueId: session.venueId,
      OR: [
        { initiatingSquadId: session.squadId },
        { rivalSquadId: session.squadId },
      ],
      initiatedAt: { gte: session.startedAt },
      // Include up to 2 minutes after counterAttackWindowEndsAt so the result screen is still reachable
      counterAttackWindowEndsAt: { gte: new Date(now.getTime() - 2 * 60 * 1000) },
    },
    orderBy: { initiatedAt: "desc" },
  });

  let activeBattle = null;
  if (activeBattleRecord) {
    const isRevealed = now >= activeBattleRecord.revealAt;
    activeBattle = {
      id: activeBattleRecord.id,
      venueId: activeBattleRecord.venueId,
      initiatingSquadId: activeBattleRecord.initiatingSquadId,
      rivalSquadId: activeBattleRecord.rivalSquadId,
      initiatingCardPower: activeBattleRecord.initiatingCardPower,
      rivalCardPower: isRevealed ? activeBattleRecord.rivalCardPower : null,
      winnerSquadId: isRevealed ? activeBattleRecord.winnerSquadId : null,
      initiatedAt: activeBattleRecord.initiatedAt.toISOString(),
      revealAt: activeBattleRecord.revealAt.toISOString(),
      counterAttackWindowEndsAt: activeBattleRecord.counterAttackWindowEndsAt.toISOString(),
      battleNumber: activeBattleRecord.battleNumber,
      isCounterAttack: activeBattleRecord.isCounterAttack,
      parentBattleId: activeBattleRecord.parentBattleId ?? null,
      revealed: isRevealed,
    };
  }

  return NextResponse.json({
    session: {
      id: session.id,
      venueId: session.venueId,
      venueName: session.venue.name,
      startedAt: session.startedAt.toISOString(),
      autoEndsAt: session.autoEndsAt.toISOString(),
      secondsRemaining,
      isClashActive: session.isClashActive,
      clashPartnerSquadId: session.clashPartnerSquadId,
      clashPartnerSquadName,
      copresentCount,
      state: session.state,
    },
    activeBattle,
  });
}
