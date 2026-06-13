import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId } = await params;
  const body = await req.json();
  const { chestId } = body as { chestId: string };

  if (!chestId) {
    return NextResponse.json({ error: "chestId required" }, { status: 400 });
  }

  // Validate caller is squad member
  const membership = await prisma.squadMember.findFirst({
    where: { squadId, profileId: user.profileId, leftAt: null },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a squad member" }, { status: 403 });
  }

  // Rate limit: one nudge per chest per nudger per 5 minutes (testing)
  const cooldownAgo = new Date(Date.now() - 5 * 60 * 1000);
  const nudgeType = `squad_nudge_${chestId}`;
  const recentNudge = await prisma.notificationSent.findFirst({
    where: {
      senderId: user.profileId,
      type: nudgeType,
      sentAt: { gte: cooldownAgo },
    },
  });
  if (recentNudge) {
    return NextResponse.json(
      { error: "already_nudged", nudged: 0, retryAfter: recentNudge.sentAt },
      { status: 429 }
    );
  }

  // Fetch nudger's display name for the notification body
  const nudgerProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { displayName: true, squadNickname: true },
  });
  const nudgerName =
    nudgerProfile?.squadNickname
      ? `@${nudgerProfile.squadNickname}`
      : (nudgerProfile?.displayName ?? "Someone");

  // Fetch squad + chest details
  const [squad, chest] = await Promise.all([
    prisma.squad.findUnique({ where: { id: squadId }, select: { name: true } }),
    prisma.squadChest.findUnique({
      where: { id: chestId },
      select: { expiresAt: true },
    }),
  ]);

  if (!chest) {
    return NextResponse.json({ error: "Chest not found" }, { status: 404 });
  }

  const squadName = squad?.name ?? "your squad";
  const chestLabel = `${squadName} chest`;

  // Compute hours until expiry for the body text
  const hoursLeft = Math.max(
    1,
    Math.floor((new Date(chest.expiresAt).getTime() - Date.now()) / 3_600_000)
  );
  const expiryHint = hoursLeft <= 1 ? "it expires soon" : `it expires in ${hoursLeft}h`;

  // Find all pending openings (excluding the nudger)
  const pendingOpenings = await prisma.squadChestOpening.findMany({
    where: {
      chestId,
      status: "pending",
      profileId: { not: user.profileId },
    },
    select: { profileId: true },
  });

  let nudged = 0;
  for (const opening of pendingOpenings) {
    await sendPushNotification(opening.profileId, {
      title: "Your squad is waiting for you 👋",
      body: `${nudgerName} nudged you · open your ${chestLabel} before ${expiryHint}`,
      data: {
        screen: "SquadChestDetail",
        chestId,
        squadId,
      },
    });
    nudged++;
  }

  // Record the nudge so the 24h gate works
  await prisma.notificationSent.create({
    data: {
      recipientId: user.profileId, // self-reference — the nudger is the "sender"
      senderId: user.profileId,
      type: nudgeType,
    },
  });

  return NextResponse.json({ nudged });
}
