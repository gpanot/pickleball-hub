import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

/**
 * Internal endpoint called by the scraper after creating a chest.
 * Sends PN1 (chest created) to all squad members except the earner.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chestId: string }> }
) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chestId } = await params;

  const chest = await prisma.squadChest.findUnique({
    where: { id: chestId },
    include: {
      earner: { select: { displayName: true, squadNickname: true } },
      squad: {
        select: {
          id: true,
          name: true,
          members: {
            where: { leftAt: null },
            select: { profileId: true },
          },
        },
      },
    },
  });

  if (!chest) {
    return NextResponse.json({ error: "Chest not found" }, { status: 404 });
  }

  const earnerName = chest.earner.squadNickname
    ? `@${chest.earner.squadNickname}`
    : chest.earner.displayName?.split(" ")[0] ?? "A teammate";

  let sent = 0;
  for (const member of chest.squad.members) {
    if (member.profileId === chest.earnerId) continue;

    const alreadySent = await prisma.notificationSent.findFirst({
      where: {
        recipientId: member.profileId,
        type: "squad_chest_created",
        sentAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (alreadySent) continue;

    await sendPushNotification(member.profileId, {
      title: "Squad chest waiting for you 📦",
      body: `${earnerName} played at ${chest.venueName ?? "a venue"} · your ${chest.squad.name} chest is ready`,
      data: { screen: "ChestDetail", chestId: chest.id, squadId: chest.squad.id },
    });

    await prisma.notificationSent.create({
      data: {
        recipientId: member.profileId,
        senderId: chest.earnerId,
        type: "squad_chest_created",
      },
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
