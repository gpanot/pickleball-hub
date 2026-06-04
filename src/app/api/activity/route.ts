import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";

const PAGE_SIZE = 50;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/activity?limit=50&offset=0
 * Merged kudos + followers for the current user (last 7 days), paginated 50 at a time.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? String(PAGE_SIZE), 10) || PAGE_SIZE,
    PAGE_SIZE
  );
  const offset = Math.max(
    parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { reclubUserId: true },
  });

  if (!profile?.reclubUserId) {
    return NextResponse.json({ items: [], hasMore: false, total: 0 });
  }

  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

  const [kudosRows, followRows] = await Promise.all([
    prisma.kudos.findMany({
      where: {
        toPlayerId: profile.reclubUserId,
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.follow.findMany({
      where: {
        followeeId: profile.reclubUserId,
        createdAt: { gte: sevenDaysAgo },
      },
      include: {
        follower: {
          select: {
            id: true,
            displayName: true,
            reclubUserId: true,
            reclubPlayer: { select: { imageUrl: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const kudosProfileIds = [...new Set(kudosRows.map((k) => k.fromPlayerId))];
  const kudosProfiles = kudosProfileIds.length
    ? await prisma.playerProfile.findMany({
        where: { id: { in: kudosProfileIds } },
        select: {
          id: true,
          displayName: true,
          reclubUserId: true,
          reclubPlayer: { select: { imageUrl: true } },
        },
      })
    : [];
  const profileMap = new Map(kudosProfiles.map((p) => [p.id, p]));

  type ActivityItem = {
    id: string;
    type: "kudos" | "follow";
    displayName: string;
    imageUrl: string | null;
    timestamp: string;
    kudosType?: string;
  };

  const allItems: ActivityItem[] = [];

  for (const k of kudosRows) {
    const p = profileMap.get(k.fromPlayerId);
    const imageUrl =
      p?.reclubPlayer?.imageUrl ??
      (p?.reclubUserId ? reclubAvatarUrl(p.reclubUserId) : null);
    allItems.push({
      id: `kudos_${k.id}`,
      type: "kudos",
      displayName: p?.displayName ?? "Player",
      imageUrl,
      timestamp: k.createdAt.toISOString(),
      kudosType: k.type,
    });
  }

  for (const f of followRows) {
    const imageUrl =
      f.follower.reclubPlayer?.imageUrl ??
      (f.follower.reclubUserId
        ? reclubAvatarUrl(f.follower.reclubUserId)
        : null);
    allItems.push({
      id: `follow_${f.id}`,
      type: "follow",
      displayName: f.follower.displayName ?? "Player",
      imageUrl,
      timestamp: f.createdAt.toISOString(),
    });
  }

  allItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const total = allItems.length;
  const items = allItems.slice(offset, offset + limit);

  return NextResponse.json({
    items,
    hasMore: offset + limit < total,
    total,
  });
}
