import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateSessionInf } from "@/lib/conquest/inf-engine";
import { refreshSquadCardStateCache } from "@/lib/conquest/card-recompute";
import { notifySquadMembers, notifyProfile } from "@/lib/conquest/notify";

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const expiredSessions = await prisma.radarSession.findMany({
    where: { state: "active", autoEndsAt: { lte: now } },
    include: {
      venue: { select: { name: true } },
      squad: { select: { name: true, emoji: true } },
    },
  });

  let processed = 0;

  for (const session of expiredSessions) {
    try {
      await processSession(session, now);
      processed++;
    } catch (e) {
      console.error(`[conquest-cron] Error processing session ${session.id}:`, e);
    }
  }

  return NextResponse.json({ processed, total: expiredSessions.length });
}

async function processSession(
  session: {
    id: string;
    squadId: string;
    playerId: string;
    venueId: number;
    startedAt: Date;
    autoEndsAt: Date;
    isClashActive: boolean;
    clashPartnerSquadId: string | null;
    venue: { name: string };
    squad: { name: string; emoji: string };
  },
  now: Date
) {
  // 1. Compute co-present count from overlapping sessions
  const copresentSessions = await prisma.radarSession.findMany({
    where: {
      squadId: session.squadId,
      venueId: session.venueId,
      state: { in: ["active", "revealed"] },
      startedAt: { lte: session.autoEndsAt },
      OR: [
        { stoppedAt: null },
        { stoppedAt: { gte: session.startedAt } },
      ],
    },
    select: { playerId: true },
    distinct: ["playerId"],
  });
  const copresentCount = copresentSessions.length;

  // 2. Check if squad is current Overlord at this venue
  const topAtVenue = await prisma.venueInfTotal.findFirst({
    where: { venueId: session.venueId },
    orderBy: { totalInf: "desc" },
    select: { squadId: true },
  });
  const isOverlord = topAtVenue?.squadId === session.squadId;

  // 3. Count card battles won during this session
  const battlesWon = await prisma.cardBattle.findMany({
    where: {
      venueId: session.venueId,
      revealAt: { gte: session.startedAt, lte: session.autoEndsAt },
      winnerSquadId: session.squadId,
      OR: [
        { initiatingSquadId: session.squadId },
        { rivalSquadId: session.squadId },
      ],
    },
    select: { initiatingSquadId: true, initiatingCardPower: true, rivalCardPower: true },
  });

  let cardPowerPerWin = 0;
  if (battlesWon.length > 0) {
    const firstWin = battlesWon[0];
    cardPowerPerWin = firstWin.initiatingSquadId === session.squadId
      ? firstWin.initiatingCardPower
      : firstWin.rivalCardPower;
  }

  // 4. Calculate final INF
  const infResult = calculateSessionInf({
    squadMembersCopresent: copresentCount,
    isClashActive: session.isClashActive,
    isOverlord,
    cardBattlesWon: battlesWon.length,
    cardPowerPerWin,
  });

  // 5. Update session state
  await prisma.radarSession.update({
    where: { id: session.id },
    data: {
      state: "revealed",
      stoppedAt: now,
      infBase: infResult.base,
      infFinal: infResult.total,
    },
  });

  // 6. Upsert VenueInfTotal
  await prisma.venueInfTotal.upsert({
    where: { squadId_venueId: { squadId: session.squadId, venueId: session.venueId } },
    create: {
      squadId: session.squadId,
      venueId: session.venueId,
      totalInf: infResult.total,
      lastUpdatedAt: now,
    },
    update: {
      totalInf: { increment: infResult.total },
      lastUpdatedAt: now,
    },
  });

  // 7. Check Overlord change
  const newTopAtVenue = await prisma.venueInfTotal.findFirst({
    where: { venueId: session.venueId },
    orderBy: { totalInf: "desc" },
    select: { squadId: true },
  });

  const previousOverlordSquadId = topAtVenue?.squadId ?? null;
  const newOverlordSquadId = newTopAtVenue?.squadId ?? null;

  if (newOverlordSquadId && newOverlordSquadId !== previousOverlordSquadId) {
    const newOverlordSquad = await prisma.squad.findUnique({
      where: { id: newOverlordSquadId },
      select: { name: true },
    });

    notifySquadMembers({
      squadId: newOverlordSquadId,
      type: "conquest_overlord_gained",
      title: `You are the new Overlord`,
      body: `${newOverlordSquad?.name ?? "Your squad"} overtook ${session.venue.name}`,
      payload: { venueId: session.venueId },
      pushData: { screen: "ConquestLeaderboard", venueId: String(session.venueId) },
    }).catch(() => {});

    if (previousOverlordSquadId) {
      const prevSquad = await prisma.squad.findUnique({
        where: { id: previousOverlordSquadId },
        select: { name: true },
      });
      notifySquadMembers({
        squadId: previousOverlordSquadId,
        type: "conquest_overlord_lost",
        title: `Territory lost`,
        body: `${newOverlordSquad?.name ?? "A squad"} took ${session.venue.name} from ${prevSquad?.name ?? "you"}`,
        payload: { venueId: session.venueId },
        pushData: { screen: "ConquestLeaderboard", venueId: String(session.venueId) },
      }).catch(() => {});
    }
  }

  // 8. Notify the player their session is revealed
  notifyProfile(session.playerId, {
    squadId: session.squadId,
    type: "conquest_session_reveal",
    title: `Session complete`,
    body: `Your INF is in — +${infResult.total} INF at ${session.venue.name}`,
    payload: { sessionId: session.id, venueId: session.venueId, infTotal: infResult.total },
    pushData: { screen: "ConquestReveal", sessionId: session.id },
  }).catch(() => {});

  // 9. Notify rival squad members that INF was posted
  if (session.isClashActive && session.clashPartnerSquadId) {
    const newRank = await prisma.venueInfTotal.findMany({
      where: { venueId: session.venueId },
      orderBy: { totalInf: "desc" },
      select: { squadId: true },
    });
    const rank = newRank.findIndex((r) => r.squadId === session.squadId) + 1;

    notifySquadMembers({
      squadId: session.clashPartnerSquadId,
      type: "conquest_rival_posted",
      title: `Rival posted INF`,
      body: `${session.squad.name} posted +${infResult.total} INF at ${session.venue.name}. They're at #${rank}.`,
      payload: { venueId: session.venueId, rivalSquadId: session.squadId, infPosted: infResult.total },
      pushData: { screen: "ConquestLeaderboard", venueId: String(session.venueId) },
    }).catch(() => {});
  }

  // 10. Refresh SquadCardState cache
  refreshSquadCardStateCache(prisma, session.squadId).catch(() => {});
  if (session.clashPartnerSquadId) {
    refreshSquadCardStateCache(prisma, session.clashPartnerSquadId).catch(() => {});
  }
}
