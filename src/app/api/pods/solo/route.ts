import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { generateAutoPodName, pickRandomPodEmoji } from "@/lib/pod-constants";

/**
 * POST /api/pods/solo
 *
 * Idempotent fetch-or-create for a player's solo Gang (Pod with squadId IS NULL).
 * Called on mount by GangSetupStep during onboarding.
 *
 * - If a solo Pod already exists for this profile, return it unchanged.
 * - Otherwise, create one with an auto-generated name and emoji.
 *
 * Covers both new users entering gang-setup for the first time and legacy
 * squad-only users who may not have a solo Pod yet.
 *
 * Response: { podId, name, emoji, isNew }
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look for an existing solo pod (squadId IS NULL, not disbanded, player is active member)
  const existingMembership = await prisma.podMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      pod: { squadId: null, disbandedAt: null },
    },
    include: { pod: { select: { id: true, name: true, emoji: true } } },
  });

  if (existingMembership) {
    return NextResponse.json({
      podId: existingMembership.pod.id,
      name: existingMembership.pod.name,
      emoji: existingMembership.pod.emoji,
      isNew: false,
    });
  }

  // Create a new solo Gang
  const name = generateAutoPodName(null);
  const emoji = pickRandomPodEmoji();

  const pod = await prisma.$transaction(async (tx) => {
    const created = await tx.pod.create({
      data: {
        squadId: null,
        name,
        emoji,
        founderId: user.profileId,
      },
    });
    await tx.podMember.create({
      data: { podId: created.id, profileId: user.profileId },
    });
    return created;
  });

  console.log(`[pods/solo] created solo Gang podId=${pod.id} for profileId=${user.profileId}`);

  return NextResponse.json({
    podId: pod.id,
    name: pod.name,
    emoji: pod.emoji,
    isNew: true,
  });
}
