import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { battleId } = await params;

  const battle = await prisma.cardBattle.findUnique({
    where: { id: battleId },
  });
  if (!battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null },
    select: { squadId: true },
  });
  const callerSquadId = membership?.squadId;

  if (callerSquadId !== battle.initiatingSquadId && callerSquadId !== battle.rivalSquadId) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const isInitiator = callerSquadId === battle.initiatingSquadId;
  const now = new Date();

  if (now < battle.revealAt) {
    return NextResponse.json({
      state: "pending",
      battleId: battle.id,
      revealAt: battle.revealAt.toISOString(),
      yourCardPower: isInitiator ? battle.initiatingCardPower : battle.rivalCardPower,
      rivalCardPower: null,
      battleNumber: battle.battleNumber,
      isCounterAttack: battle.isCounterAttack,
    });
  }

  const youWon = battle.winnerSquadId === callerSquadId;
  const yourCardPower = isInitiator ? battle.initiatingCardPower : battle.rivalCardPower;
  const theirCardPower = isInitiator ? battle.rivalCardPower : battle.initiatingCardPower;

  const existingCounter = await prisma.cardBattle.findFirst({
    where: { parentBattleId: battle.id },
  });

  const counterAttackAvailable =
    !youWon &&
    now < battle.counterAttackWindowEndsAt &&
    !existingCounter &&
    !battle.isCounterAttack;

  return NextResponse.json({
    state: "revealed",
    battleId: battle.id,
    revealAt: battle.revealAt.toISOString(),
    yourCardPower,
    rivalCardPower: theirCardPower,
    winnerSquadId: battle.winnerSquadId,
    youWon,
    cardBonusInf: youWon ? yourCardPower : 0,
    counterAttackWindowEndsAt: battle.counterAttackWindowEndsAt.toISOString(),
    counterAttackAvailable,
    battleNumber: battle.battleNumber,
    isCounterAttack: battle.isCounterAttack,
  });
}
