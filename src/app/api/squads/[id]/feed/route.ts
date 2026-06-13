import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId } = await params;

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { name: true },
  });

  const logs = await prisma.squadXpLog.findMany({
    where: { squadId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const profileIds = [...new Set(logs.map((l) => l.profileId).filter(Boolean))] as string[];
  const profiles = await prisma.playerProfile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true, displayName: true, squadNickname: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Get venue names for checkin/scraper_session events
  const chestLogs = logs.filter((l) => l.source === "checkin" || l.source === "scraper_session");
  const chestIds = new Set<string>();
  // We need to look up the most recent chest for these logs
  for (const log of chestLogs) {
    if (log.profileId) {
      const chest = await prisma.squadChest.findFirst({
        where: {
          squadId,
          earnerId: log.profileId,
          createdAt: { lte: new Date(log.createdAt.getTime() + 5000), gte: new Date(log.createdAt.getTime() - 60000) },
        },
        select: { id: true, venueName: true },
      });
      if (chest) chestIds.add(chest.id);
    }
  }

  const feed = await Promise.all(
    logs.map(async (log) => {
      const profile = log.profileId ? profileMap.get(log.profileId) : null;
      const displayName = profile?.squadNickname
        ? `@${profile.squadNickname}`
        : profile?.displayName?.split(" ")[0] ?? "Someone";

      let text = "";
      let type = log.source;
      let venueName: string | null = null;
      const milestoneMatch = log.source.match(/^streak_milestone:(\d+)$/);

      if (log.source === "checkin" || log.source === "scraper_session") {
        const chest = log.profileId
          ? await prisma.squadChest.findFirst({
              where: {
                squadId,
                earnerId: log.profileId,
                createdAt: { lte: new Date(log.createdAt.getTime() + 5000), gte: new Date(log.createdAt.getTime() - 60000) },
              },
              select: { venueName: true },
            })
          : null;
        venueName = chest?.venueName ?? null;
      }

      switch (log.source) {
        case "checkin":
          text = `${displayName} checked in at ${venueName ?? "a venue"}`;
          break;
        case "scraper_session":
          text = `${displayName} played at ${venueName ?? "a venue"} · Reclub confirmed`;
          break;
        case "chest":
          text = `${displayName} opened their chest`;
          type = "chest_opened";
          break;
        case "new_member":
          text = `${displayName} joined the squad`;
          type = "member_joined";
          break;
        case "streak":
          text = `${squad?.name ?? "Squad"} maintained the daily streak`;
          type = "streak_daily";
          break;
        default: {
          if (milestoneMatch) {
            type = "streak_milestone";
            text = `${squad?.name ?? "Squad"} hit a ${milestoneMatch[1]}-day streak`;
          } else if (log.source === "streak_milestone") {
            type = "streak_milestone";
            text = `${squad?.name ?? "Squad"} hit a streak milestone`;
          } else {
            text = `${displayName} earned XP`;
          }
        }
      }

      const feedDisplayName =
        log.source === "streak" || milestoneMatch || log.source === "streak_milestone"
          ? (squad?.name ?? "Squad")
          : displayName;

      return {
        type,
        profileId: log.profileId,
        displayName: feedDisplayName,
        text,
        xpAwarded: log.xpAmount,
        streakDays: milestoneMatch ? parseInt(milestoneMatch[1], 10) : undefined,
        createdAt: log.createdAt.toISOString(),
      };
    })
  );

  return NextResponse.json({ feed });
}
