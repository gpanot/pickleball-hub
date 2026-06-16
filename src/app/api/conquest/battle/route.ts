import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { computeCardPower } from "@/lib/conquest/card-recompute";
import { resolveCardBattle } from "@/lib/conquest/inf-engine";
import { notifySquadMembers } from "@/lib/conquest/notify";

const THREE_MINUTES_MS = 3 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { venueId } = body as { venueId: number };

  if (!venueId) {
    return NextResponse.json({ error: "venueId required" }, { status: 400 });
  }
  console.log(`[conquest/battle] POST venueId=${venueId} profileId=${user.profileId}`);

  const session = await prisma.radarSession.findFirst({
    where: { playerId: user.profileId, state: "active", venueId },
  });
  if (!session) {
    return NextResponse.json({ error: "No active session at this venue" }, { status: 400 });
  }
  if (!session.isClashActive || !session.clashPartnerSquadId) {
    return NextResponse.json({ error: "No clash active" }, { status: 400 });
  }

  const existingBattle = await prisma.cardBattle.findFirst({
    where: {
      venueId,
      battleNumber: 1,
      initiatedAt: { gte: session.startedAt },
      OR: [
        { initiatingSquadId: session.squadId },
        { rivalSquadId: session.squadId },
      ],
    },
  });
  if (existingBattle) {
    console.log(`[conquest/battle] 409 battle_already_exists id=${existingBattle.id} revealAt=${existingBattle.revealAt.toISOString()}`);
    return NextResponse.json(
      { error: "battle_already_exists", battleId: existingBattle.id },
      { status: 409 }
    );
  }

  const [myCardPower, rivalCardPower] = await Promise.all([
    computeCardPower(prisma, session.squadId),
    computeCardPower(prisma, session.clashPartnerSquadId),
  ]);

  const winnerSquadId = resolveCardBattle({
    initiatingCardPower: myCardPower,
    rivalCardPower,
    initiatingSquadId: session.squadId,
    rivalSquadId: session.clashPartnerSquadId,
  });

  const now = new Date();
  const revealAt = new Date(now.getTime() + THREE_MINUTES_MS);
  const counterAttackWindowEndsAt = new Date(revealAt.getTime() + FIVE_MINUTES_MS);

  const battle = await prisma.cardBattle.create({
    data: {
      venueId,
      initiatingSquadId: session.squadId,
      rivalSquadId: session.clashPartnerSquadId,
      initiatingCardPower: myCardPower,
      rivalCardPower,
      winnerSquadId,
      initiatedAt: now,
      revealAt,
      counterAttackWindowEndsAt,
      battleNumber: 1,
      isCounterAttack: false,
    },
  });

  console.log(`[conquest/battle] Created battle id=${battle.id} myPower=${myCardPower} rivalPower=${rivalCardPower} winner=${winnerSquadId} revealAt=${revealAt.toISOString()}`);

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true },
  });

  notifySquadMembers({
    squadId: session.squadId,
    type: "conquest_battle_progress",
    title: `Card Battle in progress`,
    body: `Battle at ${venue?.name ?? "venue"} — result reveals in 3 minutes`,
    payload: { battleId: battle.id, venueId },
    pushData: { screen: "ConquestBattle", battleId: battle.id },
  }).catch(() => {});

  notifySquadMembers({
    squadId: session.clashPartnerSquadId,
    type: "conquest_battle_progress",
    title: `Card Battle in progress`,
    body: `A rival initiated a battle at ${venue?.name ?? "venue"} — result reveals in 3 minutes`,
    payload: { battleId: battle.id, venueId },
    pushData: { screen: "ConquestBattle", battleId: battle.id },
  }).catch(() => {});

  return NextResponse.json({
    battleId: battle.id,
    revealAt: revealAt.toISOString(),
    yourCardPower: myCardPower,
    state: "pending",
  });
}
