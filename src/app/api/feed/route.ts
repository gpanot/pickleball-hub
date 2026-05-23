import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";

function toPlayerPayload(p: {
  userId: bigint;
  displayName: string | null;
  imageUrl: string | null;
  duprDoubles: any;
}) {
  return {
    userId: p.userId.toString(),
    displayName: p.displayName,
    imageUrl: p.imageUrl ?? reclubAvatarUrl(p.userId),
    duprDoubles: p.duprDoubles ? Number(p.duprDoubles) : null,
  };
}

/**
 * GET /api/feed
 *
 * Returns a chronological feed of activity from players the user follows:
 *   - "played" items: followees who attended sessions in the last 30 days
 *   - "joining" items: followees on upcoming session rosters (today or future scrapedDates)
 *
 * Sorted: joining first, then by timestamp desc. Max 2 items per player, 20 total.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    select: { followeeId: true },
  });

  if (follows.length === 0) {
    return NextResponse.json({ items: [], hasFollows: false });
  }

  const followeeIds = follows.map((f) => f.followeeId);
  const items: any[] = [];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 30 days ago as YYYY-MM-DD for scrapedDate comparison
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cutoffStr = thirtyDaysAgo.toISOString().slice(0, 10);

  // "joining" — followee is on the roster of an upcoming session (scrapedDate >= today)
  const upcomingRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: { scrapedDate: { gte: todayStr } },
    },
    include: {
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      },
      session: {
        select: {
          id: true,
          name: true,
          startTime: true,
          scrapedDate: true,
          eventUrl: true,
          maxPlayers: true,
          club: { select: { name: true } },
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { session: { startTime: "asc" } },
    take: 15,
  });

  for (const r of upcomingRosters) {
    const joined = r.session.snapshots[0]?.joined ?? 0;
    const spotsLeft = Math.max(0, r.session.maxPlayers - joined);

    items.push({
      id: `joining_${r.userId}_${r.sessionId}`,
      type: "joining",
      player: toPlayerPayload(r.player),
      isFollowing: true,
      timestamp: `${r.session.scrapedDate}T${r.session.startTime}:00`,
      sessionName: r.session.name,
      venueName: r.session.club.name,
      sessionTime: `${r.session.scrapedDate}T${r.session.startTime}:00`,
      spotsLeft,
      sessionId: r.session.id,
      eventUrl: r.session.eventUrl,
    });
  }

  // "played" — followee attended a session in last 30 days (scrapedDate < today)
  const recentRosters = await prisma.sessionRoster.findMany({
    where: {
      userId: { in: followeeIds },
      session: {
        scrapedDate: { gte: cutoffStr, lt: todayStr },
      },
    },
    include: {
      player: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      },
      session: {
        select: {
          startTime: true,
          scrapedDate: true,
          club: { select: { name: true } },
        },
      },
    },
    orderBy: { session: { scrapedDate: "desc" } },
    take: 40,
  });

  // Group by player+club, count sessions, keep most recent date
  const playedMap = new Map<
    string,
    {
      player: ReturnType<typeof toPlayerPayload>;
      venueName: string;
      count: number;
      lastSeen: string;
    }
  >();

  for (const r of recentRosters) {
    const key = `${r.userId}_${r.session.club.name}`;
    const existing = playedMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      playedMap.set(key, {
        player: toPlayerPayload(r.player),
        venueName: r.session.club.name,
        count: 1,
        lastSeen: `${r.session.scrapedDate}T${r.session.startTime}:00`,
      });
    }
  }

  for (const [, v] of playedMap) {
    items.push({
      id: `played_${v.player.userId}_${v.venueName}`,
      type: "played",
      player: v.player,
      isFollowing: true,
      timestamp: v.lastSeen,
      venueName: v.venueName,
      sessionCount: v.count,
    });
  }

  // Sort: joining first, then by timestamp desc
  items.sort((a, b) => {
    if (a.type === "joining" && b.type !== "joining") return -1;
    if (b.type === "joining" && a.type !== "joining") return 1;
    return (
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });

  // Max 2 items per player
  const playerCount = new Map<string, number>();
  const filtered = items.filter((item) => {
    const uid = item.player.userId;
    const count = playerCount.get(uid) ?? 0;
    if (count >= 2) return false;
    playerCount.set(uid, count + 1);
    return true;
  });

  return NextResponse.json({
    items: filtered.slice(0, 20),
    hasFollows: true,
  });
}
