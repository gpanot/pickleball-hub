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
 * Dev only — clears today's check-in chest, radar sessions, pulse cooldowns for retesting.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

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

  return NextResponse.json({
    ok: true,
    cleared: {
      chests: chestsDeleted.count,
      radarSessions: sessionsDeleted.count,
      pulseCooldowns: cooldownsDeleted.count,
    },
  });
}
