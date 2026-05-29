import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";
import { CACHE_CONTROL_PRIVATE } from "@/lib/http-cache-headers";

/**
 * GET /api/sessions/[id]/roster
 *
 * Returns the full confirmed roster for a session, sorted by DUPR desc.
 * Each player includes an `isFollowing` flag relative to the authenticated user.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  if (isNaN(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const user = await getMobileUser(req);

  // Fetch confirmed roster with player details
  const rosters = await prisma.sessionRoster.findMany({
    where: { sessionId, isConfirmed: true },
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
  });

  // Fetch session name + venue for context
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      name: true,
      club: { select: { name: true } },
    },
  });

  // Build followed-player set for current user
  let followedIds = new Set<string>();
  if (user?.profileId) {
    const follows = await prisma.follow.findMany({
      where: { followerId: user.profileId },
      select: { followeeId: true },
    });
    followedIds = new Set(follows.map((f) => f.followeeId.toString()));
  }

  const players = rosters
    .map((r) => ({
      userId: (r.player?.userId ?? r.userId).toString(),
      displayName: r.player?.displayName ?? "Player",
      imageUrl: r.player?.imageUrl ?? reclubAvatarUrl(r.player?.userId ?? r.userId),
      duprDoubles: r.player?.duprDoubles != null ? Number(r.player.duprDoubles) : null,
      isHost: r.isHost,
      isFollowing: followedIds.has((r.player?.userId ?? r.userId).toString()),
    }))
    .sort((a, b) => (b.duprDoubles ?? 0) - (a.duprDoubles ?? 0));

  console.log(`[roster] sessionId=${sessionId} "${session?.name}" club="${session?.club.name}" db_rows=${rosters.length} returned=${players.length}`);
  players.forEach((p, i) =>
    console.log(`[roster]   #${i + 1} uid=${p.userId} "${p.displayName}" dupr=${p.duprDoubles ?? '-'} host=${p.isHost} hasPlayer=${rosters[i]?.player != null}`)
  );
  // Log any roster rows with no linked player profile
  const orphans = rosters.filter(r => r.player == null);
  if (orphans.length > 0)
    console.log(`[roster]   ⚠ ${orphans.length} orphan row(s) with no player profile: userIds=[${orphans.map(r => r.userId.toString()).join(', ')}]`);

  return NextResponse.json(
    {
      sessionId,
      sessionName: session?.name ?? "",
      venueName: session?.club.name ?? "",
      players,
    },
    { headers: { "Cache-Control": CACHE_CONTROL_PRIVATE } }
  );
}
