import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const city = req.nextUrl.searchParams.get("city") ?? "hcm";

  const squads = await prisma.squad.findMany({
    where: {
      city,
      disbandedAt: null,
      appSlug: "squadd",
    },
    orderBy: { totalXp: "desc" },
    take: 50,
    include: {
      members: {
        where: { leftAt: null },
        select: { profileId: true },
      },
      chests: {
        select: { id: true },
      },
    },
  });

  // Get calling user's squad
  const myMembership = await prisma.squadMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      squad: { disbandedAt: null, appSlug: "squadd" },
    },
    select: { squadId: true },
  });

  const totalSquads = squads.length;
  const totalPlayers = new Set(squads.flatMap((s) => s.members.map((m) => m.profileId))).size;
  const totalSessions = squads.reduce((sum, s) => sum + s.chests.length, 0);

  // Determine reset date (first of next month)
  const now = new Date();
  const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const rankedSquads = squads.map((s, i) => ({
    rank: i + 1,
    squadId: s.id,
    name: s.name,
    emoji: s.emoji,
    color: s.color,
    xp: s.totalXp,
    level: s.level,
    memberCount: s.members.length,
    sessionCount: s.chests.length,
  }));

  const mySquadEntry = myMembership
    ? rankedSquads.find((s) => s.squadId === myMembership.squadId) ?? null
    : null;

  const cityNames: Record<string, string> = { hcm: "Ho Chi Minh City" };

  return NextResponse.json({
    city: cityNames[city] ?? city,
    period: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    resetDate: resetDate.toISOString(),
    totalSquads,
    totalPlayers,
    totalSessions,
    squads: rankedSquads,
    mySquad: mySquadEntry
      ? { rank: mySquadEntry.rank, squadId: mySquadEntry.squadId, xp: mySquadEntry.xp }
      : null,
  });
}
