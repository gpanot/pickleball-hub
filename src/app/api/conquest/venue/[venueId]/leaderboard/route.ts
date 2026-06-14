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

  const entries = await prisma.venueInfTotal.findMany({
    where: { venueId: venueIdNum },
    orderBy: { totalInf: "desc" },
    take: 20,
    include: {
      squad: { select: { id: true, name: true, emoji: true } },
    },
  });

  const leaderboard = entries.map((entry, index) => ({
    rank: index + 1,
    squadId: entry.squadId,
    squadName: entry.squad.name,
    squadEmoji: entry.squad.emoji,
    totalInf: entry.totalInf,
    isOverlord: index === 0,
    isCurrentSquad: entry.squadId === membership?.squadId,
  }));

  return NextResponse.json({ leaderboard });
}
