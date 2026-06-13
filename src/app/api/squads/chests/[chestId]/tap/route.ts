import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chestId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chestId } = await params;

  const chest = await prisma.squadChest.findUnique({
    where: { id: chestId },
    select: { expiresAt: true, squadId: true },
  });
  if (!chest) {
    return NextResponse.json({ error: "Chest not found" }, { status: 404 });
  }
  if (chest.expiresAt < new Date()) {
    return NextResponse.json({ error: "Chest expired" }, { status: 410 });
  }

  const opening = await prisma.squadChestOpening.findUnique({
    where: { chestId_profileId: { chestId, profileId: user.profileId } },
  });
  if (!opening) {
    return NextResponse.json({ error: "No opening for this user" }, { status: 403 });
  }
  if (opening.status !== "pending") {
    return NextResponse.json({ error: "Already tapped", opening: { status: opening.status, unlocksAt: opening.unlocksAt?.toISOString() } }, { status: 409 });
  }

  const now = new Date();
  const unlocksAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const updated = await prisma.squadChestOpening.update({
    where: { id: opening.id },
    data: {
      status: "unlocking",
      tappedAt: now,
      unlocksAt,
    },
  });

  return NextResponse.json({
    opening: {
      status: updated.status,
      unlocksAt: updated.unlocksAt!.toISOString(),
    },
  });
}
