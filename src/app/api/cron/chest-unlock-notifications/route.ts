import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const readyOpenings = await prisma.squadChestOpening.findMany({
    where: {
      status: "unlocking",
      unlocksAt: { lte: now },
    },
    include: {
      profile: { select: { id: true, pushToken: true, pushTokenIos: true, displayName: true } },
      chest: {
        include: {
          squad: { select: { id: true, name: true } },
        },
      },
    },
  });

  let processed = 0;
  for (const opening of readyOpenings) {
    // Skip if chest already expired
    if (opening.chest.expiresAt < now) continue;

    await prisma.squadChestOpening.update({
      where: { id: opening.id },
      data: { status: "ready" },
    });

    // Check if PN2 already sent
    const alreadySent = await prisma.notificationSent.findFirst({
      where: {
        recipientId: opening.profileId,
        type: `squad_chest_ready_${opening.chestId}`,
      },
    });
    if (alreadySent) {
      processed++;
      continue;
    }

    await sendPushNotification(opening.profileId, {
      title: "Your chest is ready!",
      body: `Open your ${opening.chest.squad.name} chest before it expires`,
      data: {
        screen: "ChestDetail",
        chestId: opening.chestId,
        squadId: opening.chest.squad.id,
      },
    });

    await prisma.notificationSent.create({
      data: {
        recipientId: opening.profileId,
        type: `squad_chest_ready_${opening.chestId}`,
      },
    });

    processed++;
  }

  return NextResponse.json({ processed });
}
