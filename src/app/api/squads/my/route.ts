import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

/** Prisma returns BigInt/Decimal — JSON.stringify throws without this. */
function serializeMySquad(membership: {
  role: string;
  joinedAt: Date;
  squad: {
    id: string;
    name: string;
    emoji: string;
    color: string;
    isPublic: boolean;
    showDupr: boolean;
    appSlug: string;
    founderId: string;
    totalXp: number;
    level: number;
    createdAt: Date;
    disbandedAt: Date | null;
    code: { id: number; squadId: string; code: string; appSlug: string; createdAt: Date } | null;
    members: Array<{
      id: number;
      squadId: string;
      profileId: string;
      role: string;
      joinedAt: Date;
      leftAt: Date | null;
      profile: {
        id: string;
        displayName: string | null;
        reclubUserId: bigint | null;
        reclubPlayer: {
          imageUrl: string | null;
          duprDoubles: { toNumber?: () => number } | number | null;
        } | null;
      };
    }>;
    invites: Array<{
      id: number;
      squadId: string;
      inviterId: string;
      inviteeId: string | null;
      inviteChannel: string;
      status: string;
      createdAt: Date;
      resolvedAt: Date | null;
      lastResentAt: Date | null;
      inviter: { id: string; displayName: string | null };
    }>;
  };
}) {
  const { squad, role, joinedAt } = membership;
  return {
    squad: {
      ...squad,
      members: squad.members.map((m) => ({
        ...m,
        profile: {
          ...m.profile,
          reclubUserId: m.profile.reclubUserId?.toString() ?? null,
          reclubPlayer: m.profile.reclubPlayer
            ? {
                ...m.profile.reclubPlayer,
                duprDoubles:
                  m.profile.reclubPlayer.duprDoubles != null
                    ? Number(m.profile.reclubPlayer.duprDoubles)
                    : null,
              }
            : null,
        },
      })),
    },
    myRole: role,
    joinedAt: joinedAt.toISOString(),
  };
}

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

  return NextResponse.json(serializeMySquad(membership));
}
