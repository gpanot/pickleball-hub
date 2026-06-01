import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { CACHE_CONTROL_PRIVATE } from "@/lib/http-cache-headers";

/**
 * GET /api/sessions/overlap?sessionId=<id>
 *
 * For each player on the current session roster (excluding the current user),
 * returns how many past sessions the current user and that player have in common.
 *
 * Response: { overlaps: { userId: string, count: number }[] }
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user || !user.reclubUserId) {
    return NextResponse.json({ overlaps: [] });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = parseInt(searchParams.get("sessionId") ?? "", 10);
  if (isNaN(sessionId)) {
    return NextResponse.json(
      { error: "sessionId required" },
      { status: 400 }
    );
  }

  console.log(
    `[overlap] user=${user.reclubUserId} sessionId=${sessionId}`
  );

  // All sessions the current user has appeared on
  const myRosters = await prisma.sessionRoster.findMany({
    where: { userId: user.reclubUserId },
    select: { sessionId: true },
  });
  const mySessionIds = myRosters.map((r) => r.sessionId);

  if (mySessionIds.length === 0) {
    return NextResponse.json(
      { overlaps: [] },
      { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } }
    );
  }

  // Players on the current session roster (excluding self)
  const currentRoster = await prisma.sessionRoster.findMany({
    where: { sessionId, isConfirmed: true },
    select: { userId: true },
  });
  const rosterUserIds = currentRoster
    .map((r) => r.userId)
    .filter((uid) => uid !== user.reclubUserId);

  if (rosterUserIds.length === 0) {
    return NextResponse.json(
      { overlaps: [] },
      { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } }
    );
  }

  // Count how many of MY past sessions each roster player also attended
  const overlaps = await prisma.sessionRoster.groupBy({
    by: ["userId"],
    where: {
      sessionId: { in: mySessionIds },
      userId: { in: rosterUserIds },
    },
    _count: { sessionId: true },
  });

  console.log(`[overlap] found ${overlaps.length} overlapping players`);

  return NextResponse.json(
    {
      overlaps: overlaps.map((o) => ({
        userId: o.userId.toString(),
        count: o._count.sessionId,
      })),
    },
    { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } }
  );
}
