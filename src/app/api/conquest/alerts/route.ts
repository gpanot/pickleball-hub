import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const alerts = await prisma.squadAlert.findMany({
    where: { recipientProfileId: user.profileId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      squad: { select: { name: true, emoji: true } },
    },
  });

  const hasMore = alerts.length > limit;
  const items = hasMore ? alerts.slice(0, limit) : alerts;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const unreadCount = await prisma.squadAlert.count({
    where: { recipientProfileId: user.profileId, readAt: null },
  });

  return NextResponse.json({
    alerts: items.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      body: a.body,
      payload: a.payload,
      squadName: a.squad.name,
      squadEmoji: a.squad.emoji,
      isRead: a.readAt !== null,
      createdAt: a.createdAt.toISOString(),
    })),
    unreadCount,
    nextCursor,
  });
}
