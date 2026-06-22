import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

function todayHCMC(): Date {
  const now = new Date();
  const hcmc = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  return new Date(Date.UTC(hcmc.getFullYear(), hcmc.getMonth(), hcmc.getDate()));
}

/**
 * POST /api/squads/dev/reset-squadd
 * Dev only — resets the Squadd gameplay loop for the current player:
 *   - Today's check-in chests (squad-scoped)
 *   - Radar sessions
 *   - Pulse cooldowns
 *   - Streak data on player profile
 *   - Unread squad alerts for this player
 *
 * Does NOT touch onboarding, brand, wallet, pod memberships, or squad membership.
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

  let chestsDeleted = 0;
  let sessionsDeleted = 0;
  let cooldownsDeleted = 0;
  let alertsDeleted = 0;

  if (membership) {
    const [chests, sessions, cooldowns] = await prisma.$transaction([
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

    chestsDeleted = chests.count;
    sessionsDeleted = sessions.count;
    cooldownsDeleted = cooldowns.count;

    // Delete unread alerts for this player in their squad
    const alerts = await prisma.squadAlert.deleteMany({
      where: {
        squadId: membership.squadId,
        recipientProfileId: user.profileId,
        readAt: null,
      },
    });
    alertsDeleted = alerts.count;
  }

  // Reset streak data and clear active intent from player profile
  const profileForPrefs = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  });
  const prefs = (profileForPrefs?.preferences as Record<string, unknown>) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dayOneIntent, dayOneIntentDate, dayOneIntentExpiresAt, dayOneIntentShown, ...clearedPrefs } = prefs;

  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: {
      streakData: { set: null } as Parameters<typeof prisma.playerProfile.update>[0]['data']['streakData'],
      streakComputedAt: null,
      preferences: clearedPrefs,
    },
  });

  console.log(
    `[reset-squadd] profileId=${user.profileId} chests=${chestsDeleted} sessions=${sessionsDeleted} cooldowns=${cooldownsDeleted} alerts=${alertsDeleted} streak=reset`
  );

  return NextResponse.json({
    ok: true,
    cleared: {
      chests: chestsDeleted,
      radarSessions: sessionsDeleted,
      pulseCooldowns: cooldownsDeleted,
      alerts: alertsDeleted,
      streakReset: true,
    },
  });
}
