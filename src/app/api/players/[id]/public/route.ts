import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reclubAvatarUrl } from "@/lib/utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // id must be a PlayerProfile UUID (not a numeric Reclub userId)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      reclubUserId: true,
      user: { select: { image: true } },
      reclubPlayer: { select: { imageUrl: true, displayName: true } },
      _count: { select: { following: true } },
    },
  });

  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nickname =
    profile.displayName ??
    profile.reclubPlayer?.displayName ??
    "Player";

  const avatarUrl =
    profile.user?.image ??
    profile.reclubPlayer?.imageUrl ??
    (profile.reclubUserId ? reclubAvatarUrl(profile.reclubUserId) : null);

  return NextResponse.json({
    id: profile.id,
    nickname,
    avatarUrl,
    followingCount: profile._count.following,
    reclubUserId: profile.reclubUserId?.toString() ?? null,
  });
}
