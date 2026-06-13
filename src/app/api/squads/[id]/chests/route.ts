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
  const status = req.nextUrl.searchParams.get("status") ?? "active";

  const where: Record<string, unknown> = { squadId };
  if (status === "active") {
    where.expiresAt = { gte: new Date() };
  }

  const chests = await prisma.squadChest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      earner: {
        select: { id: true, displayName: true, squadNickname: true },
      },
      openings: {
        select: {
          profileId: true,
          status: true,
          tappedAt: true,
          unlocksAt: true,
          openedAt: true,
          kudosAwarded: true,
          xpAwarded: true,
          profile: {
            select: { id: true, displayName: true, squadNickname: true },
          },
        },
      },
    },
  });

  const result = chests.map((c) => ({
    id: c.id,
    squadId: c.squadId,
    earnerId: c.earnerId,
    earnerName: c.earner.squadNickname
      ? `@${c.earner.squadNickname}`
      : c.earner.displayName?.split(" ")[0] ?? "?",
    source: c.source,
    venueName: c.venueName,
    createdAt: c.createdAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
    openings: c.openings.map((o) => ({
      profileId: o.profileId,
      displayName: o.profile.squadNickname
        ? `@${o.profile.squadNickname}`
        : o.profile.displayName?.split(" ")[0] ?? "?",
      status: o.status,
      tappedAt: o.tappedAt?.toISOString() ?? null,
      unlocksAt: o.unlocksAt?.toISOString() ?? null,
      openedAt: o.openedAt?.toISOString() ?? null,
      kudosAwarded: o.kudosAwarded,
      xpAwarded: o.xpAwarded,
    })),
    myOpening: c.openings.find((o) => o.profileId === user.profileId)
      ? {
          status: c.openings.find((o) => o.profileId === user.profileId)!.status,
          unlocksAt: c.openings.find((o) => o.profileId === user.profileId)!.unlocksAt?.toISOString() ?? null,
        }
      : null,
  }));

  return NextResponse.json({ chests: result });
}
