import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

/** GET /api/squads/pending-invite — returns the newest pending invite for the current user. */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invite = await prisma.squadInvite.findFirst({
    where: {
      inviteeId: user.profileId,
      status: "pending",
      squad: { disbandedAt: null },
    },
    orderBy: { createdAt: "desc" },
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

  if (!invite) {
    return NextResponse.json({ invite: null });
  }

  const { squad } = invite;
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
    invite: {
      id: invite.id,
      squadId: squad.id,
      preview: {
        id: squad.id,
        name: squad.name,
        emoji: squad.emoji,
        color: squad.color,
        memberCount: members.length,
        avgDupr,
        avatars,
        founderId: squad.founderId,
      },
    },
  });
}
