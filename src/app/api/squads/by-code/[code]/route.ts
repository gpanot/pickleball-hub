import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const squadCode = await prisma.squadCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      squad: {
        include: {
          members: {
            where: { leftAt: null },
            include: {
              profile: {
                select: {
                  id: true,
                  displayName: true,
                  reclubPlayer: {
                    select: { imageUrl: true, duprDoubles: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!squadCode || squadCode.squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  const { squad } = squadCode;
  const members = squad.members;

  let avgDupr: number | null = null;
  if (squad.showDupr) {
    const duprs = members
      .map((m) => m.profile.reclubPlayer?.duprDoubles)
      .filter((d): d is NonNullable<typeof d> => d != null)
      .map(Number);
    if (duprs.length > 0) {
      avgDupr = Math.round((duprs.reduce((a, b) => a + b, 0) / duprs.length) * 10) / 10;
    }
  }

  const avatars = members.slice(0, 4).map((m) => ({
    displayName: m.profile.displayName,
    imageUrl: m.profile.reclubPlayer?.imageUrl ?? null,
  }));

  return NextResponse.json({
    id: squad.id,
    name: squad.name,
    emoji: squad.emoji,
    color: squad.color,
    memberCount: members.length,
    avgDupr,
    avatars,
    founderId: squad.founderId,
  });
}
