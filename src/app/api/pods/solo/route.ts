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

  // Optional custom name/emoji/playstyle from the Gang creation flow
  let bodyName: string | null = null;
  let bodyEmoji: string | null = null;
  let bodyPlaystyle: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.name === "string" && body.name.trim()) bodyName = body.name.trim();
    if (typeof body.emoji === "string" && body.emoji.trim()) bodyEmoji = body.emoji.trim();
    if (typeof body.playstyle === "string") bodyPlaystyle = body.playstyle;
  } catch {}

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
    // If a custom name/emoji was provided, update the existing pod
    if (bodyName || bodyEmoji) {
      const updated = await prisma.pod.update({
        where: { id: existingMembership.pod.id },
        data: {
          ...(bodyName ? { name: bodyName } : {}),
          ...(bodyEmoji ? { emoji: bodyEmoji } : {}),
        },
        select: { id: true, name: true, emoji: true },
      });
      return NextResponse.json({ podId: updated.id, name: updated.name, emoji: updated.emoji, isNew: false });
    }
    return NextResponse.json({
      podId: existingMembership.pod.id,
      name: existingMembership.pod.name,
      emoji: existingMembership.pod.emoji,
      isNew: false,
    });
  }

  // Create a new solo Gang with the provided or auto-generated name/emoji
  const playstyleKey = bodyPlaystyle as import("@/lib/pod-constants").PlayStyle | null;
  const name = bodyName ?? generateAutoPodName(playstyleKey);
  const emoji = bodyEmoji ?? pickRandomPodEmoji();

  const pod = await prisma.$transaction(async (tx) => {
    const created = await tx.pod.create({
      data: { squadId: null, name, emoji, founderId: user.profileId },
    });
    await tx.podMember.create({
      data: { podId: created.id, profileId: user.profileId },
    });
    return created;
  });

  console.log(`[pods/solo] created solo Gang podId=${pod.id} name="${name}" for profileId=${user.profileId}`);

  return NextResponse.json({ podId: pod.id, name: pod.name, emoji: pod.emoji, isNew: true });
}
