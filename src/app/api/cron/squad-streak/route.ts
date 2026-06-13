import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { awardSquadXp, STREAK_DAILY_XP } from "@/lib/squad-xp";

const STREAK_MILESTONES = [3, 7, 14, 30] as const;

function todayHCMC(): Date {
  const now = new Date();
  const hcmc = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  return new Date(Date.UTC(hcmc.getFullYear(), hcmc.getMonth(), hcmc.getDate()));
}

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayHCMC();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const activeSquads = await prisma.squad.findMany({
    where: { disbandedAt: null, appSlug: "squadd" },
    select: { id: true, streakDays: true, streakLastUpdated: true },
  });

  let updated = 0;
  let reset = 0;

  for (const squad of activeSquads) {
    const hadActivity = await prisma.squadChest.findFirst({
      where: { squadId: squad.id, checkinDate: today },
    });

    if (hadActivity) {
      // Only increment if we haven't already updated for today
      const alreadyUpdated = squad.streakLastUpdated &&
        squad.streakLastUpdated.getTime() === today.getTime();
      if (!alreadyUpdated) {
        const newStreak = squad.streakDays + 1;

        await prisma.squad.update({
          where: { id: squad.id },
          data: {
            streakDays: newStreak,
            streakLastUpdated: today,
          },
        });

        // Daily streak XP bonus (separate from check-in / chest XP)
        await awardSquadXp(prisma, squad.id, null, "streak", STREAK_DAILY_XP);

        if (STREAK_MILESTONES.includes(newStreak as (typeof STREAK_MILESTONES)[number])) {
          await prisma.squadXpLog.create({
            data: {
              squadId: squad.id,
              profileId: null,
              source: `streak_milestone:${newStreak}`,
              xpAmount: 0,
            },
          });
        }

        updated++;
      }
    } else {
      // Reset streak if no chest created today and last update was before yesterday
      if (
        squad.streakDays > 0 &&
        (!squad.streakLastUpdated || squad.streakLastUpdated.getTime() < yesterday.getTime())
      ) {
        await prisma.squad.update({
          where: { id: squad.id },
          data: { streakDays: 0 },
        });
        reset++;
      }
    }
  }

  return NextResponse.json({ updated, reset, total: activeSquads.length });
}
