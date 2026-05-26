import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";

/**
 * GET /api/players/:id/co-players
 *
 * Given a Reclub userId, returns:
 *   1. lastSessions — the player's last 2 sessions with rosters
 *   2. coPlayers    — other players ranked by co-attendance, excluding already-followed
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reclubUserId = BigInt(id);

  const mobileUser = await getMobileUser(req);
  const profileId = mobileUser?.profileId;

  // Already-followed IDs (to exclude from suggestions)
  let followedIds: bigint[] = [];
  if (profileId) {
    const follows = await prisma.follow.findMany({
      where: { followerId: profileId },
      select: { followeeId: true },
    });
    followedIds = follows.map((f) => f.followeeId);
  }

  // Last 2 sessions this player attended
  const recentRosters = await prisma.sessionRoster.findMany({
    where: { userId: reclubUserId },
    orderBy: { session: { startTime: "desc" } },
    take: 2,
    include: {
      session: {
        select: {
          id: true,
          name: true,
          startTime: true,
          referenceCode: true,
          club: { select: { name: true } },
          rosters: {
            include: {
              player: {
                select: {
                  userId: true,
                  displayName: true,
                  imageUrl: true,
                  duprDoubles: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const lastSessions = recentRosters.map((r) => ({
    sessionId: r.session.id,
    name: r.session.name,
    startTime: r.session.startTime,
    referenceCode: r.session.referenceCode,
    clubName: r.session.club.name,
    roster: r.session.rosters.map((sr) => ({
      userId: sr.player.userId.toString(),
      displayName: sr.player.displayName,
      imageUrl: sr.player.imageUrl ?? reclubAvatarUrl(sr.player.userId),
      duprDoubles: sr.player.duprDoubles
        ? Number(sr.player.duprDoubles)
        : null,
    })),
  }));

  // Collect all session IDs this player has attended
  const allRosters = await prisma.sessionRoster.findMany({
    where: { userId: reclubUserId },
    select: { sessionId: true },
  });
  const sessionIds = allRosters.map((r) => r.sessionId);

  if (sessionIds.length === 0) {
    return NextResponse.json({ lastSessions, coPlayers: [] });
  }

  // Find co-attending players, count co-sessions, rank by frequency
  const coAttendees = await prisma.sessionRoster.groupBy({
    by: ["userId"],
    where: {
      sessionId: { in: sessionIds },
      userId: {
        not: reclubUserId,
        notIn: followedIds.length > 0 ? followedIds : undefined,
      },
    },
    _count: { sessionId: true },
    orderBy: { _count: { sessionId: "desc" } },
    take: 20,
  });

  const coPlayerIds = coAttendees.map((c) => c.userId);
  const players = await prisma.player.findMany({
    where: { userId: { in: coPlayerIds } },
    select: {
      userId: true,
      displayName: true,
      imageUrl: true,
      duprDoubles: true,
    },
  });

  const playerMap = new Map(players.map((p) => [p.userId.toString(), p]));

  const coPlayers = coAttendees
    .map((c) => {
      const p = playerMap.get(c.userId.toString());
      if (!p) return null;
      return {
        userId: p.userId.toString(),
        displayName: p.displayName,
        imageUrl: p.imageUrl ?? reclubAvatarUrl(p.userId),
        duprDoubles: p.duprDoubles ? Number(p.duprDoubles) : null,
        coSessionCount: c._count.sessionId,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ lastSessions, coPlayers });
}
