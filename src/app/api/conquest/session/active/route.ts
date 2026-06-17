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
    return NextResponse.json({ session: null, activeBattle: null });
  }

  // If the session has passed its autoEndsAt, treat it as ended from the client's perspective.
  // The conquest-session-close cron will mark it as "revealed" on its next tick.
  const now = new Date();
  if (session.autoEndsAt < now) {
    return NextResponse.json({ session: null, activeBattle: null });
  }

  const copresentCount = await prisma.radarSession.count({
    where: {
      venueId: session.venueId,
      squadId: session.squadId,
      state: "active",
    },
  });

  const secondsRemaining = Math.max(
    0,
    Math.floor((session.autoEndsAt.getTime() - now.getTime()) / 1000)
  );

  // ── Find ALL rival squads currently active at the same venue ──────────────
  // A rival is any squad != ours that has an active session at the same venue
  const rivalSessions = await prisma.radarSession.findMany({
    where: {
      venueId: session.venueId,
      state: "active",
      squadId: { not: session.squadId },
    },
    include: {
      squad: { select: { id: true, name: true, emoji: true } },
    },
    distinct: ["squadId"],
  });

  // ── For each rival, find their battle with us (if any) ───────────────────
  const clashRivals: Array<{
    squadId: string;
    squadName: string;
    squadEmoji: string;
    battle: {
      id: string;
      revealAt: string;
      revealed: boolean;
      winnerSquadId: string | null;
      initiatingCardPower: number;
      rivalCardPower: number | null;
    } | null;
  }> = [];

  for (const rival of rivalSessions) {
    const battleRecord = await prisma.cardBattle.findFirst({
      where: {
        venueId: session.venueId,
        initiatedAt: { gte: session.startedAt },
        OR: [
          { initiatingSquadId: session.squadId, rivalSquadId: rival.squadId },
          { initiatingSquadId: rival.squadId, rivalSquadId: session.squadId },
        ],
      },
      orderBy: { initiatedAt: "desc" },
    });

    const isRevealed = battleRecord ? now >= battleRecord.revealAt : false;

    clashRivals.push({
      squadId: rival.squad.id,
      squadName: rival.squad.name,
      squadEmoji: rival.squad.emoji,
      battle: battleRecord
        ? {
            id: battleRecord.id,
            revealAt: battleRecord.revealAt.toISOString(),
            revealed: isRevealed,
            winnerSquadId: isRevealed ? battleRecord.winnerSquadId : null,
            initiatingCardPower: battleRecord.initiatingCardPower,
            rivalCardPower: isRevealed ? battleRecord.rivalCardPower : null,
          }
        : null,
    });
  }

  // ── Most recent battle for this session (for the home screen ActiveBattleCard) ──
  const activeBattleRecord = await prisma.cardBattle.findFirst({
    where: {
      venueId: session.venueId,
      OR: [
        { initiatingSquadId: session.squadId },
        { rivalSquadId: session.squadId },
      ],
      initiatedAt: { gte: session.startedAt },
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

  // Legacy single-rival fields kept for backwards compatibility
  const primaryRival = clashRivals[0] ?? null;

  return NextResponse.json({
    session: {
      id: session.id,
      venueId: session.venueId,
      venueName: session.venue.name,
      startedAt: session.startedAt.toISOString(),
      autoEndsAt: session.autoEndsAt.toISOString(),
      secondsRemaining,
      isClashActive: clashRivals.length > 0,
      clashPartnerSquadId: primaryRival?.squadId ?? null,
      clashPartnerSquadName: primaryRival?.squadName ?? null,
      copresentCount,
      state: session.state,
      clashRivals,
    },
    activeBattle,
  });
}
