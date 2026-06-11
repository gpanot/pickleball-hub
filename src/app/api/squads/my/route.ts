import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      squad: { appSlug: "squadd", disbandedAt: null },
    },
    include: {
      squad: {
        include: {
          code: true,
          members: {
            where: { leftAt: null },
            include: {
              profile: {
                select: {
                  id: true,
                  displayName: true,
                  reclubUserId: true,
                  reclubPlayer: {
                    select: {
                      imageUrl: true,
                      duprDoubles: true,
                    },
                  },
                },
              },
            },
          },
          invites: {
            include: {
              inviter: {
                select: { id: true, displayName: true },
              },
            },
          },
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ squad: null });
  }

  return NextResponse.json({
    squad: membership.squad,
    myRole: membership.role,
    joinedAt: membership.joinedAt,
  });
}
