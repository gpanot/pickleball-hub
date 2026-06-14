import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { computeCardPower } from "@/lib/conquest/card-recompute";
import { resolveCardBattle } from "@/lib/conquest/inf-engine";
import { notifySquadMembers } from "@/lib/conquest/notify";

const THREE_MINUTES_MS = 3 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { battleId } = await params;

  const parentBattle = await prisma.cardBattle.findUnique({
    where: { id: battleId },
  });
  if (!parentBattle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null },
    select: { squadId: true },
  });
  const callerSquadId = membership?.squadId;

  if (!callerSquadId) {
    return NextResponse.json({ error: "Not in a squad" }, { status: 403 });
  }

  if (parentBattle.winnerSquadId === callerSquadId) {
    return NextResponse.json({ error: "Only the losing squad can counter-attack" }, { status: 403 });
  }

  if (callerSquadId !== parentBattle.initiatingSquadId && callerSquadId !== parentBattle.rivalSquadId) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const now = new Date();
  if (now >= parentBattle.counterAttackWindowEndsAt) {
    return NextResponse.json({ error: "Counter-attack window closed" }, { status: 410 });
  }

  const existingCounter = await prisma.cardBattle.findFirst({
    where: { parentBattleId: battleId },
  });
  if (existingCounter) {
    return NextResponse.json(
      { error: "counter_already_exists", battleId: existingCounter.id },
      { status: 409 }
    );
  }

  const activeSession = await prisma.radarSession.findFirst({
    where: { playerId: user.profileId, state: "active", venueId: parentBattle.venueId },
  });
  if (!activeSession) {
    return NextResponse.json({ error: "No active session at this venue" }, { status: 400 });
  }

  const rivalSquadId = callerSquadId === parentBattle.initiatingSquadId
    ? parentBattle.rivalSquadId
    : parentBattle.initiatingSquadId;

  const [myCardPower, rivalCardPower] = await Promise.all([
    computeCardPower(prisma, callerSquadId),
    computeCardPower(prisma, rivalSquadId),
  ]);

  const winnerSquadId = resolveCardBattle({
    initiatingCardPower: myCardPower,
    rivalCardPower,
    initiatingSquadId: callerSquadId,
    rivalSquadId,
  });

  const revealAt = new Date(now.getTime() + THREE_MINUTES_MS);
  const counterAttackWindowEndsAt = new Date(revealAt.getTime() + FIVE_MINUTES_MS);

  const battle = await prisma.cardBattle.create({
    data: {
      venueId: parentBattle.venueId,
      initiatingSquadId: callerSquadId,
      rivalSquadId,
      initiatingCardPower: myCardPower,
      rivalCardPower,
      winnerSquadId,
      initiatedAt: now,
      revealAt,
      counterAttackWindowEndsAt,
      battleNumber: 2,
      isCounterAttack: true,
      parentBattleId: battleId,
    },
  });

  const venue = await prisma.venue.findUnique({
    where: { id: parentBattle.venueId },
    select: { name: true },
  });

  notifySquadMembers({
    squadId: callerSquadId,
    type: "conquest_battle_progress",
    title: `Counter-Attack launched`,
    body: `Counter-attack at ${venue?.name ?? "venue"} — result reveals in 3 minutes`,
    payload: { battleId: battle.id, venueId: parentBattle.venueId },
    pushData: { screen: "ConquestBattle", battleId: battle.id },
  }).catch(() => {});

  notifySquadMembers({
    squadId: rivalSquadId,
    type: "conquest_battle_progress",
    title: `Counter-Attack incoming`,
    body: `Rival launched a counter-attack at ${venue?.name ?? "venue"} — result in 3 minutes`,
    payload: { battleId: battle.id, venueId: parentBattle.venueId },
    pushData: { screen: "ConquestBattle", battleId: battle.id },
  }).catch(() => {});

  return NextResponse.json({
    battleId: battle.id,
    revealAt: revealAt.toISOString(),
    yourCardPower: myCardPower,
    state: "pending",
  });
}
