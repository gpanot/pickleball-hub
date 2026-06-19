import { prisma } from "@/lib/db";
import { generateAutoPodName, pickRandomPodEmoji } from "@/lib/pod-constants";
import type { PlayStyle } from "@/lib/pod-constants";

export interface PodWithMembers {
  id: string;
  squadId: string;
  name: string;
  emoji: string;
  founderId: string;
  members: Array<{
    profileId: string;
    displayName: string;
  }>;
}

export interface EnsurePodResult {
  podId: string;
  created: boolean;
  pod: PodWithMembers;
}

/**
 * Idempotent — if the player already has an active PodMember row in this squad,
 * returns it immediately. Otherwise creates a Pod + PodMember in a transaction
 * and returns the full pod data so callers don't need a second query.
 */
export async function ensurePlayerHasPod(
  profileId: string,
  squadId: string,
  playStyle: PlayStyle | null = null,
): Promise<EnsurePodResult> {
  const existing = await prisma.podMember.findFirst({
    where: { profileId, leftAt: null, pod: { squadId, disbandedAt: null } },
    include: {
      pod: {
        include: {
          members: {
            where: { leftAt: null },
            include: {
              profile: {
                select: { id: true, displayName: true, squadNickname: true },
              },
            },
          },
        },
      },
    },
  });

  if (existing) {
    return {
      podId: existing.podId,
      created: false,
      pod: serializePod(existing.pod),
    };
  }

  const name = generateAutoPodName(playStyle);
  const emoji = pickRandomPodEmoji();

  const created = await prisma.$transaction(async (tx) => {
    const newPod = await tx.pod.create({
      data: { squadId, name, emoji, founderId: profileId },
    });
    await tx.podMember.create({
      data: { podId: newPod.id, profileId },
    });
    return newPod;
  });

  const podWithMembers = await prisma.pod.findUniqueOrThrow({
    where: { id: created.id },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          profile: {
            select: { id: true, displayName: true, squadNickname: true },
          },
        },
      },
    },
  });

  return {
    podId: created.id,
    created: true,
    pod: serializePod(podWithMembers),
  };
}

function serializePod(pod: {
  id: string;
  squadId: string;
  name: string;
  emoji: string;
  founderId: string;
  members: Array<{
    profileId: string;
    profile: { id: string; displayName: string | null; squadNickname: string | null };
  }>;
}): PodWithMembers {
  return {
    id: pod.id,
    squadId: pod.squadId,
    name: pod.name,
    emoji: pod.emoji,
    founderId: pod.founderId,
    members: pod.members.map((m) => ({
      profileId: m.profileId,
      displayName: m.profile.squadNickname
        ? `@${m.profile.squadNickname}`
        : m.profile.displayName?.split(" ")[0] ?? "?",
    })),
  };
}
