import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { awardSquadXp, rollChestXp, EARNER_CHEST_KUDOS, CONTRIBUTOR_CHEST_KUDOS } from "@/lib/squad-xp";

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
    select: { expiresAt: true, squadId: true, earnerId: true },
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

  // Allow opening if status is 'ready' OR if unlocks_at has passed (cron may not have updated yet)
  const isReady = opening.status === "ready" ||
    (opening.status === "unlocking" && opening.unlocksAt && opening.unlocksAt <= new Date());

  if (!isReady) {
    return NextResponse.json({ error: "Chest not ready yet" }, { status: 403 });
  }

  const isEarner = chest.earnerId === user.profileId;
  const kudos = isEarner ? EARNER_CHEST_KUDOS : CONTRIBUTOR_CHEST_KUDOS;
  const xp = rollChestXp(isEarner);

  await prisma.squadChestOpening.update({
    where: { id: opening.id },
    data: {
      status: "opened",
      openedAt: new Date(),
      kudosAwarded: kudos,
      xpAwarded: xp,
    },
  });

  await awardSquadXp(prisma, chest.squadId, user.profileId, "chest", xp);

  const squad = await prisma.squad.findUnique({
    where: { id: chest.squadId },
    select: { totalXp: true, level: true },
  });

  return NextResponse.json({
    kudosAwarded: kudos,
    xpAwarded: xp,
    squadLevel: squad?.level ?? 1,
    squadXp: squad?.totalXp ?? 0,
  });
}
