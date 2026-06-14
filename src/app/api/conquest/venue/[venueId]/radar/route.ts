import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { venueId } = await params;
  const venueIdNum = parseInt(venueId, 10);
  if (isNaN(venueIdNum)) {
    return NextResponse.json({ error: "Invalid venueId" }, { status: 400 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null },
    select: { squadId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not in a squad" }, { status: 403 });
  }

  const friendlyBlips = await prisma.radarSession.count({
    where: { venueId: venueIdNum, squadId: membership.squadId, state: "active" },
  });

  const mySession = await prisma.radarSession.findFirst({
    where: { playerId: user.profileId, venueId: venueIdNum, state: "active" },
    select: { isClashActive: true, clashPartnerSquadId: true },
  });

  let rivalDetected = false;
  let rivalSquadName: string | null = null;

  if (mySession?.isClashActive && mySession.clashPartnerSquadId) {
    rivalDetected = true;
    const rival = await prisma.squad.findUnique({
      where: { id: mySession.clashPartnerSquadId },
      select: { name: true },
    });
    rivalSquadName = rival?.name ?? null;
  } else {
    const rivalSession = await prisma.radarSession.findFirst({
      where: { venueId: venueIdNum, state: "active", squadId: { not: membership.squadId } },
      select: { id: true },
    });
    if (rivalSession) {
      rivalDetected = true;
      // Fog of war: rival squad name is null until clash is confirmed
    }
  }

  return NextResponse.json({
    friendlyBlips,
    rivalDetected,
    rivalSquadName,
  });
}
