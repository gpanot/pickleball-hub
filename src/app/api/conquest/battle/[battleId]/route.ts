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
  console.log(`[conquest/battle] GET battleId=${battleId} profileId=${user.profileId}`);

  const battle = await prisma.cardBattle.findUnique({
    where: { id: battleId },
  });
  if (!battle) {
    console.warn(`[conquest/battle] GET battleId=${battleId} — not found`);
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null },
    select: { squadId: true },
  });
  const callerSquadId = membership?.squadId;

  if (callerSquadId !== battle.initiatingSquadId && callerSquadId !== battle.rivalSquadId) {
    console.warn(`[conquest/battle] GET battleId=${battleId} — caller squad ${callerSquadId} not a participant`);
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const now = new Date();
  // revealed is derived from the timestamp — there is no DB column for it
  const isRevealed = now >= battle.revealAt;

  const youWon = battle.winnerSquadId === callerSquadId;

  const existingCounter = await prisma.cardBattle.findFirst({
    where: { parentBattleId: battle.id },
  });

  const counterAttackAvailable =
    isRevealed &&
    !youWon &&
    now < battle.counterAttackWindowEndsAt &&
    !existingCounter &&
    !battle.isCounterAttack;

  console.log(
    `[conquest/battle] GET battleId=${battleId} isRevealed=${isRevealed} youWon=${youWon} counterAttackAvailable=${counterAttackAvailable}`
  );

  // Return the full ConquestBattle shape that the mobile app expects
  return NextResponse.json({
    battle: {
      id: battle.id,
      venueId: battle.venueId,
      initiatingSquadId: battle.initiatingSquadId,
      rivalSquadId: battle.rivalSquadId,
      initiatingCardPower: battle.initiatingCardPower,
      rivalCardPower: isRevealed ? battle.rivalCardPower : null,
      winnerSquadId: isRevealed ? battle.winnerSquadId : null,
      initiatedAt: battle.initiatedAt.toISOString(),
      revealAt: battle.revealAt.toISOString(),
      counterAttackWindowEndsAt: battle.counterAttackWindowEndsAt.toISOString(),
      battleNumber: battle.battleNumber,
      isCounterAttack: battle.isCounterAttack,
      parentBattleId: battle.parentBattleId ?? null,
      revealed: isRevealed,
      // Caller-specific helpers
      youWon: isRevealed ? youWon : null,
      counterAttackAvailable,
    },
  });
}
