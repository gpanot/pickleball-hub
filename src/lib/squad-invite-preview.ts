import { prisma } from "@/lib/db";

export type SquadInviteKnownMember = {
  profileId: string;
  userId: string | null;
  displayName: string | null;
  imageUrl: string | null;
  dupr: number | null;
  isFounder: boolean;
  sessionsTogether: number;
  isFollowing: boolean;
};

export type SquadInvitePreview = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  memberCount: number;
  avgDupr: number | null;
  district: string;
  founderId: string;
  inviterName: string | null;
  knownMembers: SquadInviteKnownMember[];
  avatars: Array<{ displayName: string | null; imageUrl: string | null }>;
};

type SquadWithMembers = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  level: number;
  showDupr: boolean;
  founderId: string;
  members: Array<{
    profileId: string;
    role: string;
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
};

function parseDistrict(squad: { name: string; level: number }) {
  const match = squad.name.match(/^D(\d+)/i);
  if (match) return `D${match[1]}`;
  return `D${squad.level}`;
}

export async function buildSquadInvitePreview(
  squad: SquadWithMembers,
  viewer?: { profileId: string; reclubUserId: bigint | null },
  inviterDisplayName?: string | null,
): Promise<SquadInvitePreview> {
  const members = squad.members;

  let avgDupr: number | null = null;
  if (squad.showDupr) {
    const duprs = members
      .map((m) => m.profile.reclubPlayer?.duprDoubles)
      .filter((d): d is NonNullable<typeof d> => d != null)
      .map((d) => Number(d));
    if (duprs.length > 0) {
      avgDupr = Math.round((duprs.reduce((a, b) => a + b, 0) / duprs.length) * 10) / 10;
    }
  }

  const founder = members.find((m) => m.profileId === squad.founderId);
  // Prefer squadNickname as the display identifier
  const founderNickname = (founder?.profile as any)?.squadNickname ?? null;
  const inviterName =
    inviterDisplayName?.trim() ||
    (founderNickname ? `@${founderNickname}` : null) ||
    founder?.profile.displayName ||
    null;

  const overlapByReclubId = new Map<string, number>();
  const followedReclubIds = new Set<string>();

  if (viewer?.reclubUserId) {
    const myRosters = await prisma.sessionRoster.findMany({
      where: { userId: viewer.reclubUserId },
      select: { sessionId: true },
    });
    const mySessionIds = myRosters.map((r) => r.sessionId);

    const memberReclubIds = members
      .map((m) => m.profile.reclubUserId)
      .filter((id): id is bigint => id != null);

    if (mySessionIds.length > 0 && memberReclubIds.length > 0) {
      const overlaps = await prisma.sessionRoster.groupBy({
        by: ["userId"],
        where: {
          sessionId: { in: mySessionIds },
          userId: { in: memberReclubIds },
        },
        _count: { sessionId: true },
      });
      for (const row of overlaps) {
        overlapByReclubId.set(row.userId.toString(), row._count.sessionId);
      }
    }

    const follows = await prisma.follow.findMany({
      where: { followerId: viewer.profileId },
      select: { followeeId: true },
    });
    for (const f of follows) {
      followedReclubIds.add(f.followeeId.toString());
    }
  }

  const allMemberRows: SquadInviteKnownMember[] = members.map((m) => {
    const reclubId = m.profile.reclubUserId?.toString() ?? null;
    return {
      profileId: m.profile.id,
      userId: reclubId,
      displayName: m.profile.displayName,
      imageUrl: m.profile.reclubPlayer?.imageUrl ?? null,
      dupr:
        m.profile.reclubPlayer?.duprDoubles != null
          ? Number(m.profile.reclubPlayer.duprDoubles)
          : null,
      isFounder: m.profileId === squad.founderId,
      sessionsTogether: reclubId ? overlapByReclubId.get(reclubId) ?? 0 : 0,
      isFollowing: reclubId ? followedReclubIds.has(reclubId) : false,
    };
  });

  const knownMembers = allMemberRows
    .filter(
      (m) =>
        m.profileId !== viewer?.profileId &&
        (m.isFollowing || m.sessionsTogether > 0 || m.isFounder),
    )
    .sort((a, b) => {
      if (a.isFounder !== b.isFounder) return a.isFounder ? -1 : 1;
      if (b.sessionsTogether !== a.sessionsTogether) {
        return b.sessionsTogether - a.sessionsTogether;
      }
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });

  const displayMembers =
    knownMembers.length > 0 ? knownMembers : allMemberRows.filter((m) => m.profileId !== viewer?.profileId);

  const avatars = members.slice(0, 4).map((m) => ({
    displayName: m.profile.displayName,
    imageUrl: m.profile.reclubPlayer?.imageUrl ?? null,
  }));

  return {
    id: squad.id,
    name: squad.name,
    emoji: squad.emoji,
    color: squad.color,
    memberCount: members.length,
    avgDupr,
    district: parseDistrict(squad),
    founderId: squad.founderId,
    inviterName,
    knownMembers: displayMembers,
    avatars,
  };
}
