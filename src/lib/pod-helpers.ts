import { prisma } from "@/lib/db";
import { generateAutoPodName, pickRandomPodEmoji } from "@/lib/pod-constants";
import type { PlayStyle } from "@/lib/pod-constants";

export interface PodWithMembers {
  id: string;
  squadId: string | null;
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
 * returns it immediately.
 *
 * Gang-first behaviour: if the player has a solo Gang (squadId IS NULL), attach
 * it to the squad rather than creating a new Pod. This preserves the Gang name
 * and member list the player set up during onboarding.
 *
 * Falls back to creating a brand-new Pod only when neither of the above applies.
 */
export async function ensurePlayerHasPod(
  profileId: string,
  squadId: string,
  playStyle: PlayStyle | null = null,
): Promise<EnsurePodResult> {
  // Check: already has an active pod in this squad
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

  // Check: player has a solo Gang (squadId IS NULL) — attach it to this squad
  const soloMembership = await prisma.podMember.findFirst({
    where: { profileId, leftAt: null, pod: { squadId: null, disbandedAt: null } },
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

  if (soloMembership) {
    await prisma.pod.update({
      where: { id: soloMembership.podId },
      data: { squadId },
    });
    const updatedPod = { ...soloMembership.pod, squadId };
    return {
      podId: soloMembership.podId,
      created: false,
      pod: serializePod(updatedPod),
    };
  }

  // Fallback: create a new Pod in this squad
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
  squadId: string | null;
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
