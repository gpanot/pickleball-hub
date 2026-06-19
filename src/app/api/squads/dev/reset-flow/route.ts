import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

function todayHCMC(): Date {
  const now = new Date();
  const hcmc = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  return new Date(Date.UTC(hcmc.getFullYear(), hcmc.getMonth(), hcmc.getDate()));
}

/**
 * POST /api/squads/dev/reset-flow
 * Dev only — clears today's check-in chest, radar sessions, pulse cooldowns,
 * and optionally resets brand/wallet/welcomeChest so the onboarding flow can be retested.
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null },
    select: { squadId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not in a squad" }, { status: 403 });
  }

  const today = todayHCMC();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [chestsDeleted, sessionsDeleted, cooldownsDeleted] = await prisma.$transaction([
    prisma.squadChest.deleteMany({
      where: {
        squadId: membership.squadId,
        earnerId: user.profileId,
        OR: [
          { checkinDate: today },
          { createdAt: { gte: oneDayAgo } },
        ],
      },
    }),
    prisma.radarSession.deleteMany({
      where: { playerId: user.profileId },
    }),
    prisma.venuePulseCooldown.deleteMany({
      where: { playerId: user.profileId },
    }),
  ]);

  // Reset brand, wallet, and welcome chest so the full onboarding flow can be re-run
  await prisma.$transaction([
    prisma.playerBrand.deleteMany({ where: { profileId: user.profileId } }),
    prisma.playerWallet.deleteMany({ where: { profileId: user.profileId } }),
    prisma.tokenLedger.deleteMany({ where: { profileId: user.profileId } }),
    prisma.playerProfile.update({
      where: { id: user.profileId },
      data: { welcomeChestClaimed: false },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    cleared: {
      chests: chestsDeleted.count,
      radarSessions: sessionsDeleted.count,
      pulseCooldowns: cooldownsDeleted.count,
      brandReset: true,
    },
  });
}
