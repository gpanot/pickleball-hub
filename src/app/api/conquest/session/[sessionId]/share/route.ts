import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  const session = await prisma.radarSession.findUnique({
    where: { id: sessionId },
    include: {
      venue: { select: { name: true, address: true } },
      squad: { select: { name: true, emoji: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.playerId !== user.profileId) {
    return NextResponse.json({ error: "Not your session" }, { status: 403 });
  }

  if (session.state !== "revealed") {
    return NextResponse.json({ error: "Session not yet revealed" }, { status: 400 });
  }

  let rivalSquad: { name: string; emoji: string } | null = null;
  if (session.clashPartnerSquadId) {
    const rival = await prisma.squad.findUnique({
      where: { id: session.clashPartnerSquadId },
      select: { name: true, emoji: true },
    });
    rivalSquad = rival;
  }

  const battles = await prisma.cardBattle.findMany({
    where: {
      venueId: session.venueId,
      revealAt: { gte: session.startedAt, lte: session.autoEndsAt },
      OR: [
        { initiatingSquadId: session.squadId },
        { rivalSquadId: session.squadId },
      ],
    },
    orderBy: { battleNumber: "asc" },
    select: {
      battleNumber: true,
      isCounterAttack: true,
      winnerSquadId: true,
      initiatingSquadId: true,
      initiatingCardPower: true,
      rivalCardPower: true,
    },
  });

  const battleResults = battles.map((b) => {
    const won = b.winnerSquadId === session.squadId;
    const cardPower = b.initiatingSquadId === session.squadId
      ? b.initiatingCardPower
      : b.rivalCardPower;
    return {
      number: b.battleNumber,
      isCounterAttack: b.isCounterAttack,
      won,
      cardBonus: won ? cardPower : 0,
    };
  });

  // Check if this session made the squad Overlord
  const topAtVenue = await prisma.venueInfTotal.findFirst({
    where: { venueId: session.venueId },
    orderBy: { totalInf: "desc" },
    select: { squadId: true },
  });
  const isNewOverlord = topAtVenue?.squadId === session.squadId;

  // Build tags
  const tags: string[] = [];
  if (session.isClashActive) tags.push("Arena Clash");
  if (battleResults.some((b) => b.won)) tags.push("Card Victory");
  if (isNewOverlord) tags.push("New Overlord");

  // Extract district from venue address if available
  const districtMatch = session.venue.address?.match(/D(\d+)|District\s*(\d+)/i);
  const venueDistrict = districtMatch ? `D${districtMatch[1] || districtMatch[2]}` : null;

  return NextResponse.json({
    infTotal: session.infFinal ?? 0,
    venueName: session.venue.name,
    venueDistrict,
    mySquad: { name: session.squad.name, emoji: session.squad.emoji },
    rivalSquad,
    battles: battleResults,
    isNewOverlord,
    tags,
  });
}
