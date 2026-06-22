import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

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

  const today = todayHCMC();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (membership) {
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

    console.log(`[reset-flow] cleared chests=${chestsDeleted.count} sessions=${sessionsDeleted.count} cooldowns=${cooldownsDeleted.count}`);
  }

  // Read preferences so we can clear intent keys before full reset
  const profileForPrefs = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  });
  const prefs = (profileForPrefs?.preferences as Record<string, unknown>) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dayOneIntent, dayOneIntentDate, dayOneIntentExpiresAt, dayOneIntentShown, ...clearedPrefs } = prefs;

  // Reset brand, wallet, welcome chest, onboardingCompleted, squad membership, and intent
  // so the full unified onboarding funnel can be re-run from scratch.
  await prisma.$transaction([
    prisma.playerBrand.deleteMany({ where: { profileId: user.profileId } }),
    prisma.playerWallet.deleteMany({ where: { profileId: user.profileId } }),
    prisma.tokenLedger.deleteMany({ where: { profileId: user.profileId } }),
    // Remove pod memberships
    prisma.podMember.deleteMany({ where: { profileId: user.profileId } }),
    // Remove squad memberships (marks leftAt so history is preserved)
    prisma.squadMember.updateMany({
      where: { profileId: user.profileId, leftAt: null },
      data: { leftAt: new Date() },
    }),
    prisma.playerProfile.update({
      where: { id: user.profileId },
      data: {
        welcomeChestClaimed: false,
        onboardingCompleted: false,
        preferences: clearedPrefs as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    cleared: {
      brandReset: true,
      walletReset: true,
      onboardingReset: true,
      squadMembershipReset: true,
    },
  });
}
