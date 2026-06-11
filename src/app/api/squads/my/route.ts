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

  const pendingRaw = membership.squad.invites.filter((i) => i.status === "pending");
  const pendingByInvitee = new Map<string, (typeof pendingRaw)[number]>();
  for (const invite of pendingRaw) {
    const key = invite.inviteeId ?? `anon-${invite.id}`;
    const existing = pendingByInvitee.get(key);
    if (!existing || invite.createdAt > existing.createdAt) {
      pendingByInvitee.set(key, invite);
    }
  }
  const pendingInvites = [...pendingByInvitee.values()];

  const inviteeIds = pendingInvites
    .map((i) => i.inviteeId)
    .filter((id): id is string => id !== null);

  const inviteProfiles =
    inviteeIds.length > 0
      ? await prisma.playerProfile.findMany({
          where: { id: { in: inviteeIds } },
          select: {
            id: true,
            displayName: true,
            reclubPlayer: { select: { imageUrl: true } },
          },
        })
      : [];

  const inviteProfileMap = new Map(inviteProfiles.map((p) => [p.id, p]));

  membership.squad.invites = pendingInvites.map((invite) => {
    const profile = invite.inviteeId
      ? inviteProfileMap.get(invite.inviteeId)
      : null;
    return {
      ...invite,
      displayName: profile?.displayName ?? null,
      avatar: profile?.reclubPlayer?.imageUrl ?? null,
      channel: invite.inviteChannel,
    };
  }) as typeof membership.squad.invites;

  return NextResponse.json(serializeMySquad(membership));
}
