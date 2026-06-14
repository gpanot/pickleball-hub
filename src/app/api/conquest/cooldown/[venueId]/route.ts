import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { venueId } = await params;
  const venueIdNum = parseInt(venueId, 10);
  if (isNaN(venueIdNum)) {
    return NextResponse.json({ error: "Invalid venueId" }, { status: 400 });
  }

  const cooldown = await prisma.venuePulseCooldown.findUnique({
    where: { playerId_venueId: { playerId: user.profileId, venueId: venueIdNum } },
  });

  if (!cooldown || cooldown.cooldownEndsAt <= new Date()) {
    return NextResponse.json({ inCooldown: false, cooldownEndsAt: null, secondsRemaining: null });
  }

  const secondsRemaining = Math.max(
    0,
    Math.floor((cooldown.cooldownEndsAt.getTime() - Date.now()) / 1000)
  );

  return NextResponse.json({
    inCooldown: true,
    cooldownEndsAt: cooldown.cooldownEndsAt.toISOString(),
    secondsRemaining,
  });
}
