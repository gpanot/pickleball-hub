import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { MIN_POD_NAME_LENGTH, MAX_POD_NAME_LENGTH, POD_EMOJIS } from "@/lib/pod-constants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: podId } = await params;

  let body: { name?: string; emoji?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, emoji } = body;

  if (name !== undefined) {
    const trimmed = name.trim();
    if (trimmed.length < MIN_POD_NAME_LENGTH || trimmed.length > MAX_POD_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name must be ${MIN_POD_NAME_LENGTH}–${MAX_POD_NAME_LENGTH} characters` },
        { status: 400 },
      );
    }
  }

  if (emoji !== undefined && !POD_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  // Verify caller is an active member of this Pod
  const membership = await prisma.podMember.findFirst({
    where: { podId, profileId: user.profileId, leftAt: null },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this Pod" }, { status: 403 });
  }

  const updated = await prisma.pod.update({
    where: { id: podId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(emoji !== undefined ? { emoji } : {}),
    },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          profile: { select: { id: true, displayName: true, squadNickname: true } },
        },
      },
    },
  });

  return NextResponse.json({
    id: updated.id,
    squadId: updated.squadId,
    name: updated.name,
    emoji: updated.emoji,
    founderId: updated.founderId,
    members: updated.members.map((m) => ({
      profileId: m.profileId,
      displayName: m.profile.squadNickname
        ? `@${m.profile.squadNickname}`
        : m.profile.displayName?.split(" ")[0] ?? "?",
    })),
  });
}
