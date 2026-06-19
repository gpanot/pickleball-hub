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
  const { venueId, rivalSquadId: requestedRivalSquadId } = body as {
    venueId: number;
    rivalSquadId?: string;
  };

  if (!venueId) {
    return NextResponse.json({ error: "venueId required" }, { status: 400 });
  }
  console.log(
    `[conquest/battle] POST venueId=${venueId} profileId=${user.profileId} rivalSquadId=${requestedRivalSquadId ?? "auto"}`
  );

  const session = await prisma.radarSession.findFirst({
    where: { playerId: user.profileId, state: "active", venueId, autoEndsAt: { gt: new Date() } },
  });
  if (!session) {
    return NextResponse.json(
      { error: "No active session at this venue" },
      { status: 400 }
    );
  }

  // Determine the target rival squad:
  // - If client sent an explicit rivalSquadId, validate it is actually at the venue
  // - Otherwise fall back to the legacy clashPartnerSquadId on the session
  let targetRivalSquadId: string | null = null;

  if (requestedRivalSquadId) {
    const rivalSession = await prisma.radarSession.findFirst({
      where: {
        squadId: requestedRivalSquadId,
        venueId,
        state: "active",
        autoEndsAt: { gt: new Date() },
      },
    });
    if (!rivalSession) {
      console.warn(
        `[conquest/battle] rivalSquadId=${requestedRivalSquadId} not active at venue=${venueId}, checking all rivals`
      );
    } else {
      targetRivalSquadId = requestedRivalSquadId;
    }
  }

  // Fall back to any rival present at the venue
  if (!targetRivalSquadId) {
    const anyRivalSession = await prisma.radarSession.findFirst({
      where: {
        venueId,
        state: "active",
        squadId: { not: session.squadId },
        autoEndsAt: { gt: new Date() },
      },
    });
    targetRivalSquadId = anyRivalSession?.squadId ?? null;
  }

  if (!targetRivalSquadId) {
    console.warn(`[conquest/battle] No rival found at venue=${venueId} for squad=${session.squadId}`);
    return NextResponse.json({ error: "No clash active" }, { status: 400 });
  }

  // Check for an existing battle between this exact pair since our session started.
  // Use OR to match regardless of who initiated, and normalise the pair so we
  // catch the race condition where both sides fire simultaneously.
  const existingBattle = await prisma.cardBattle.findFirst({
    where: {
      venueId,
      initiatedAt: { gte: session.startedAt },
      OR: [
        {
          initiatingSquadId: session.squadId,
          rivalSquadId: targetRivalSquadId,
        },
        {
          initiatingSquadId: targetRivalSquadId,
          rivalSquadId: session.squadId,
        },
      ],
    },
    orderBy: { initiatedAt: "desc" },
  });

  if (existingBattle) {
    console.log(
      `[conquest/battle] 409 battle_already_exists id=${existingBattle.id} pair=${session.squadId}<>${targetRivalSquadId}`
    );
    return NextResponse.json(
      { error: "battle_already_exists", battleId: existingBattle.id },
      { status: 409 }
    );
  }

  const [myCardPower, rivalCardPower] = await Promise.all([
    computeCardPower(prisma, session.squadId),
    computeCardPower(prisma, targetRivalSquadId),
  ]);

  const winnerSquadId = resolveCardBattle({
    initiatingCardPower: myCardPower,
    rivalCardPower,
    initiatingSquadId: session.squadId,
    rivalSquadId: targetRivalSquadId,
  });

  const now = new Date();
  const revealAt = new Date(now.getTime() + THREE_MINUTES_MS);
  const counterAttackWindowEndsAt = new Date(revealAt.getTime() + FIVE_MINUTES_MS);

  let battle;
  try {
    battle = await prisma.cardBattle.create({
      data: {
        venueId,
        initiatingSquadId: session.squadId,
        rivalSquadId: targetRivalSquadId,
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
  } catch (err: any) {
    // Unique constraint violation — a concurrent request created the battle first
    console.warn(`[conquest/battle] create race-condition caught: ${err?.message}`);
    const raceBattle = await prisma.cardBattle.findFirst({
      where: {
        venueId,
        initiatedAt: { gte: session.startedAt },
        OR: [
          { initiatingSquadId: session.squadId, rivalSquadId: targetRivalSquadId },
          { initiatingSquadId: targetRivalSquadId, rivalSquadId: session.squadId },
        ],
      },
      orderBy: { initiatedAt: "desc" },
    });
    if (raceBattle) {
      console.log(`[conquest/battle] Returning race-winner battle id=${raceBattle.id}`);
      return NextResponse.json(
        { error: "battle_already_exists", battleId: raceBattle.id },
        { status: 409 }
      );
    }
    throw err;
  }

  console.log(
    `[conquest/battle] Created battle id=${battle.id} ${session.squadId}<>${targetRivalSquadId} myPower=${myCardPower} rivalPower=${rivalCardPower} winner=${winnerSquadId} revealAt=${revealAt.toISOString()}`
  );

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
    squadId: targetRivalSquadId,
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
