import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

const EMPTY_GEAR = { gender: null, cap: null, shirt: null, paddle: null, shoes: null, setupComplete: false };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;
  const reclubUserId = BigInt(userId);

  try {
    const profile = await prisma.playerProfile.findFirst({
      where: { reclubUserId },
      select: { id: true, gender: true },
    });

    if (!profile) {
      return NextResponse.json(EMPTY_GEAR);
    }

    const gear = await prisma.playerGear.findUnique({
      where: { profileId: profile.id },
      select: { cap: true, shirt: true, paddle: true, shoes: true, setupCompletedAt: true },
    });

    if (!gear) {
      return NextResponse.json({ ...EMPTY_GEAR, gender: profile.gender ?? null });
    }

    const setupComplete =
      gear.setupCompletedAt != null ||
      (gear.cap != null && gear.shirt != null && gear.paddle != null && gear.shoes != null);

    return NextResponse.json({ ...gear, gender: profile.gender ?? null, setupComplete });
  } catch (err) {
    console.error("[GET /api/players/by-user/[userId]/gear]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
