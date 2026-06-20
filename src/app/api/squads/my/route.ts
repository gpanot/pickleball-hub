import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { ensurePlayerHasPod } from "@/lib/pod-helpers";

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
    city: string;
    streakDays: number;
    streakLastUpdated: Date | null;
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
        squadNickname: string | null;
        squadNicknameSetAt: Date | null;
        reclubUserId: bigint | null;
        reclubPlayer: {
          imageUrl: string | null;
          duprDoubles: { toNumber?: () => number } | number | null;
        } | null;
      };
    }>;
    invites: Array<{
      id: number;
      squadId: string | null;
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
          squadNicknameSetAt: m.profile.squadNicknameSetAt?.toISOString() ?? null,
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
                  squadNickname: true,
                  squadNicknameSetAt: true,
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
    const disbandedMembership = await prisma.squadMember.findFirst({
      where: {
        profileId: user.profileId,
        role: { not: "founder" },
        leftAt: { not: null },
        squad: { appSlug: "squadd", disbandedAt: { not: null } },
      },
      orderBy: { leftAt: "desc" },
      include: {
        squad: {
          include: {
            founder: { select: { displayName: true } },
          },
        },
      },
    });

    if (disbandedMembership) {
      return NextResponse.json({
        squad: null,
        disbandedNotice: {
          squadId: disbandedMembership.squad.id,
          squadName: disbandedMembership.squad.name,
          founderName:
            disbandedMembership.squad.founder.displayName ?? "The founder",
          disbandedAt: disbandedMembership.squad.disbandedAt!.toISOString(),
        },
      });
    }

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
            squadNickname: true,
            reclubPlayer: { select: { imageUrl: true } },
          },
        })
      : [];

  const inviteProfileMap = new Map(inviteProfiles.map((p) => [p.id, p]));

  membership.squad.invites = pendingInvites.map((invite) => {
    const profile = invite.inviteeId
      ? inviteProfileMap.get(invite.inviteeId)
      : null;
    const label = profile?.squadNickname
      ? `@${profile.squadNickname}`
      : profile?.displayName ?? null;
    return {
      ...invite,
      displayName: label,
      avatar: profile?.reclubPlayer?.imageUrl ?? null,
      channel: invite.inviteChannel,
    };
  }) as typeof membership.squad.invites;

  // Phase 2: activeChest, myOpening, recentFeed, streak
  const now = new Date();
  const activeChest = await prisma.squadChest.findFirst({
    where: {
      squadId: membership.squad.id,
      expiresAt: { gte: now },
    },
    orderBy: { createdAt: "desc" },
    include: {
      earner: { select: { id: true, displayName: true, squadNickname: true } },
      openings: {
        select: {
          profileId: true, status: true, tappedAt: true,
          unlocksAt: true, openedAt: true, kudosAwarded: true, xpAwarded: true,
          profile: { select: { id: true, displayName: true, squadNickname: true } },
        },
      },
    },
  });

  let activeChestData = null;
  let myOpeningData = null;
  if (activeChest) {
    activeChestData = {
      id: activeChest.id,
      earnerId: activeChest.earnerId,
      earnerName: activeChest.earner.squadNickname
        ? `@${activeChest.earner.squadNickname}`
        : activeChest.earner.displayName?.split(" ")[0] ?? "?",
      source: activeChest.source,
      venueName: activeChest.venueName,
      createdAt: activeChest.createdAt.toISOString(),
      expiresAt: activeChest.expiresAt.toISOString(),
      openings: activeChest.openings.map((o) => ({
        profileId: o.profileId,
        displayName: o.profile.squadNickname
          ? `@${o.profile.squadNickname}`
          : o.profile.displayName?.split(" ")[0] ?? "?",
        status: o.status,
        unlocksAt: o.unlocksAt?.toISOString() ?? null,
      })),
    };

    const myOp = activeChest.openings.find((o) => o.profileId === user.profileId);
    if (myOp) {
      myOpeningData = {
        status: myOp.status,
        unlocksAt: myOp.unlocksAt?.toISOString() ?? null,
      };
    }
  }

  // Recent feed (last 10 xp_log entries)
  const recentLogs = await prisma.squadXpLog.findMany({
    where: { squadId: membership.squad.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const feedProfileIds = [...new Set(recentLogs.map((l) => l.profileId).filter(Boolean))] as string[];
  const feedProfiles = feedProfileIds.length > 0
    ? await prisma.playerProfile.findMany({
        where: { id: { in: feedProfileIds } },
        select: { id: true, displayName: true, squadNickname: true },
      })
    : [];
  const feedProfileMap = new Map(feedProfiles.map((p) => [p.id, p]));

  const recentFeed = recentLogs.map((log) => {
    const profile = log.profileId ? feedProfileMap.get(log.profileId) : null;
    const dn = profile?.squadNickname
      ? `@${profile.squadNickname}`
      : profile?.displayName?.split(" ")[0] ?? "Someone";

    let type = log.source;
    if (log.source === "chest") type = "chest_opened";
    if (log.source === "new_member") type = "member_joined";
    if (log.source === "streak") type = "streak_daily";
    const milestoneMatch = log.source.match(/^streak_milestone:(\d+)$/);
    if (milestoneMatch) type = "streak_milestone";

    return {
      type,
      profileId: log.profileId,
      displayName: log.source === "streak" || milestoneMatch
        ? membership.squad.name
        : dn,
      xpAwarded: log.xpAmount,
      streakDays: milestoneMatch ? parseInt(milestoneMatch[1], 10) : undefined,
      createdAt: log.createdAt.toISOString(),
    };
  });

  const streak = {
    days: membership.squad.streakDays ?? 0,
    lastPlayedAt: membership.squad.streakLastUpdated?.toISOString() ?? null,
  };

  // Player contribution stats
  const [sessionCount, xpEarned, chestsOpened] = await Promise.all([
    prisma.squadChest.count({
      where: { squadId: membership.squad.id, earnerId: user.profileId },
    }),
    prisma.squadXpLog.aggregate({
      where: { squadId: membership.squad.id, profileId: user.profileId },
      _sum: { xpAmount: true },
    }),
    prisma.squadChestOpening.count({
      where: {
        profileId: user.profileId,
        status: "opened",
        chest: { squadId: membership.squad.id },
      },
    }),
  ]);

  const myContribution = {
    sessions: sessionCount,
    xpEarned: xpEarned._sum.xpAmount ?? 0,
    chestsOpened,
  };

  // Active Pod — self-heals only when onboarding is complete.
  // Guard: skip implicit pod creation during the funnel so CREATE POD does not 409.
  const profileForPod = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { onboardingCompleted: true },
  });
  const onboardingCompleted = profileForPod?.onboardingCompleted ?? false;

  let myPod: { id: string; name: string; emoji: string; founderId: string; members: unknown[] } | null = null;
  if (onboardingCompleted) {
    const podResult = await ensurePlayerHasPod(
      user.profileId,
      membership.squad.id,
      null,
    );
    myPod = {
      id: podResult.pod.id,
      name: podResult.pod.name,
      emoji: podResult.pod.emoji,
      founderId: podResult.pod.founderId,
      members: podResult.pod.members,
    };
  }

  // Fetch pod membership for all squad members so we can show their pod name
  const memberProfileIds = membership.squad.members.map((m) => m.profileId);
  const podMemberships = memberProfileIds.length > 0
    ? await prisma.podMember.findMany({
        where: {
          profileId: { in: memberProfileIds },
          leftAt: null,
          pod: { squadId: membership.squad.id, disbandedAt: null },
        },
        select: {
          profileId: true,
          pod: { select: { name: true, emoji: true } },
        },
      })
    : [];
  const podByProfile = new Map(podMemberships.map((pm) => [pm.profileId, pm.pod]));

  const battlesWon = await prisma.cardBattle.count({
    where: { winnerSquadId: membership.squad.id },
  });

  const serialized = serializeMySquad(membership);
  const membersWithPod = serialized.squad.members.map((m) => {
    const pod = podByProfile.get(m.profileId);
    return { ...m, podName: pod ? `${pod.emoji} ${pod.name}` : null };
  });

  return NextResponse.json({
    ...serialized,
    squad: { ...serialized.squad, members: membersWithPod, battlesWon },
    activeChest: activeChestData,
    myOpening: myOpeningData,
    recentFeed,
    streak,
    myContribution,
    myPod,
  });
}
