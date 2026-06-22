import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import type { PrismaClient, Prisma } from "@prisma/client";
import { awardSquadXp, XP_AMOUNTS } from "@/lib/squad-xp";
import { sendPushNotification } from "@/lib/notifications";

async function markIntentFulfilled(db: PrismaClient, profileId: string) {
  try {
    const profile = await db.playerProfile.findUnique({
      where: { id: profileId },
      select: { preferences: true },
    });
    const prefs = (profile?.preferences as Record<string, unknown>) ?? {};
    const expiresAt = prefs.dayOneIntentExpiresAt as string | null;
    if (
      prefs.dayOneIntent &&
      expiresAt &&
      new Date(expiresAt) > new Date() &&
      prefs.dayOneIntentFulfilled == null
    ) {
      await db.playerProfile.update({
        where: { id: profileId },
        data: { preferences: { ...prefs, dayOneIntentFulfilled: true } as unknown as Prisma.InputJsonValue },
      });
    }
  } catch (e) {
    console.error("[INTENT_FULFILL] checkin:", e);
  }
}

function todayHCMC(): Date {
  const now = new Date();
  const hcmc = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  return new Date(Date.UTC(hcmc.getFullYear(), hcmc.getMonth(), hcmc.getDate()));
}

function tomorrowMidnightHCMC(): string {
  const today = todayHCMC();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString();
}

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { squadId, venueName, venueId, taggedProfileIds } = body as {
    squadId: string;
    venueName?: string;
    venueId?: number;
    taggedProfileIds?: string[];
  };

  if (!squadId) {
    return NextResponse.json({ error: "squadId required" }, { status: 400 });
  }

  // Validate caller is active member
  const membership = await prisma.squadMember.findFirst({
    where: {
      squadId,
      profileId: user.profileId,
      leftAt: null,
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a squad member" }, { status: 403 });
  }

  const today = todayHCMC();

  // Daily cap: one chest per player per calendar day (HCMC)
  const existingChest = await prisma.squadChest.findFirst({
    where: {
      squadId,
      earnerId: user.profileId,
      checkinDate: today,
    },
  });
  if (existingChest) {
    return NextResponse.json(
      { error: "already_checked_in", nextCheckinAt: tomorrowMidnightHCMC() },
      { status: 429 }
    );
  }

  // 1h spam guard — only counts check-in chests, not intent chests
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCheckinChest = await prisma.squadChest.findFirst({
    where: {
      earnerId: user.profileId,
      squadId,
      source: "checkin",
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentCheckinChest) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: new Date(recentCheckinChest.createdAt.getTime() + 60 * 60 * 1000).toISOString() },
      { status: 429 }
    );
  }

  // Squad-level chest cap: max 15 active chests across all earners
  const CHEST_CAP = 15;
  const activeChestCount = await prisma.squadChest.count({
    where: { squadId, expiresAt: { gte: new Date() } },
  });
  if (activeChestCount >= CHEST_CAP) {
    return NextResponse.json(
      { error: "chest_limit_reached", message: "Your squad already has 15 chests waiting — open some first!" },
      { status: 429 }
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Create chest
  const chest = await prisma.squadChest.create({
    data: {
      squadId,
      earnerId: user.profileId,
      source: "checkin",
      venueName: venueName ?? null,
      checkinDate: today,
      expiresAt,
    },
  });

  // Create opening rows for all active squad members
  const activeMembers = await prisma.squadMember.findMany({
    where: { squadId, leftAt: null },
    select: { profileId: true },
  });

  await prisma.squadChestOpening.createMany({
    data: activeMembers.map((m) => ({
      chestId: chest.id,
      profileId: m.profileId,
      status: "pending",
    })),
    skipDuplicates: true,
  });

  // Award check-in XP
  await awardSquadXp(prisma, squadId, user.profileId, "checkin", XP_AMOUNTS.checkin);

  // Respond immediately so the client doesn't time out
  const response = NextResponse.json({
    chest: { id: chest.id, expiresAt: chest.expiresAt.toISOString() },
    xpAwarded: XP_AMOUNTS.checkin,
  });

  // Fire-and-forget: mark active intent as fulfilled + send push notifications
  (async () => {
    try {
      await markIntentFulfilled(prisma, user.profileId);
      const recipientMembers = await prisma.squadMember.findMany({
        where: { squadId, leftAt: null, profileId: { not: user.profileId } },
        include: {
          profile: { select: { id: true, pushToken: true, pushTokenIos: true } },
        },
      });

      const earnerProfile = await prisma.playerProfile.findUnique({
        where: { id: user.profileId },
        select: { displayName: true, squadNickname: true },
      });
      const earnerName = earnerProfile?.squadNickname
        ? `@${earnerProfile.squadNickname}`
        : earnerProfile?.displayName?.split(" ")[0] ?? "A teammate";

      const squad = await prisma.squad.findUnique({
        where: { id: squadId },
        select: { name: true },
      });

      for (const member of recipientMembers) {
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
          body: `${earnerName} checked in at ${venueName ?? "a venue"} · your ${squad?.name ?? "squad"} chest is ready`,
          data: {
            screen: "ChestDetail",
            chestId: chest.id,
            squadId,
          },
        });

        await prisma.notificationSent.create({
          data: {
            recipientId: member.profileId,
            senderId: user.profileId,
            type: "squad_chest_created",
          },
        });
      }
    } catch (e) {
      console.error("[CHECKIN] Background notification error:", e);
    }
  })();

  return response;
}
