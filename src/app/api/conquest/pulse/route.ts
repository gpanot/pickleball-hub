import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import type { PrismaClient, Prisma } from "@prisma/client";
import { detectClash } from "@/lib/conquest/clash-detector";
import { notifySquadMembers, notifyProfile } from "@/lib/conquest/notify";

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
    console.error("[INTENT_FULFILL] pulse:", e);
  }
}

const TWO_HOURS_MS = 5 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { venueId, taggedProfileIds } = body as {
    venueId: number;
    taggedProfileIds?: string[];
  };

  if (!venueId) {
    return NextResponse.json({ error: "venueId required" }, { status: 400 });
  }

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true },
  });
  if (!venue) {
    return NextResponse.json({ error: "venue_not_found", venueId }, { status: 400 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null },
    select: { squadId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not in a squad" }, { status: 403 });
  }
  const squadId = membership.squadId;

  const existingActive = await prisma.radarSession.findFirst({
    where: { playerId: user.profileId, state: "active", autoEndsAt: { gt: new Date() } },
  });
  if (existingActive) {
    return NextResponse.json(
      { error: "active_session_exists", sessionId: existingActive.id },
      { status: 409 }
    );
  }

  const cooldown = await prisma.venuePulseCooldown.findUnique({
    where: { playerId_venueId: { playerId: user.profileId, venueId } },
  });
  if (cooldown && cooldown.cooldownEndsAt > new Date()) {
    return NextResponse.json(
      { error: "cooldown_active", cooldownEndsAt: cooldown.cooldownEndsAt.toISOString() },
      { status: 429 }
    );
  }

  const now = new Date();
  const autoEndsAt = new Date(now.getTime() + TWO_HOURS_MS);
  const cooldownEndsAt = new Date(now.getTime() + TWELVE_HOURS_MS);

  const session = await prisma.radarSession.create({
    data: {
      squadId,
      playerId: user.profileId,
      venueId,
      startedAt: now,
      autoEndsAt,
      state: "active",
    },
  });

  await prisma.venuePulseCooldown.upsert({
    where: { playerId_venueId: { playerId: user.profileId, venueId } },
    create: { playerId: user.profileId, venueId, lastPulseAt: now, cooldownEndsAt },
    update: { lastPulseAt: now, cooldownEndsAt },
  });

  // Fire-and-forget: mark active play intent as fulfilled
  void markIntentFulfilled(prisma, user.profileId);

  const rival = await detectClash(prisma, venueId, squadId, session.id);

  let clashDetected = false;
  let rivalSquadId: string | null = null;

  if (rival) {
    clashDetected = true;
    rivalSquadId = rival.squadId;

    const [mySquad, , venue] = await Promise.all([
      prisma.squad.findUnique({ where: { id: squadId }, select: { name: true } }),
      prisma.squad.findUnique({ where: { id: rival.squadId }, select: { name: true } }),
      prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
    ]);

    notifySquadMembers({
      squadId,
      type: "conquest_clash_detected",
      title: `Arena Clash at ${venue?.name ?? "venue"}`,
      body: `A rival squad just checked in — Battle for ownership now!`,
      payload: { venueId, sessionId: session.id },
      pushData: { screen: "ConquestBattle", venueId: String(venueId) },
    }).catch(() => {});

    notifySquadMembers({
      squadId: rival.squadId,
      type: "conquest_clash_detected",
      title: `Arena Clash at ${venue?.name ?? "venue"}`,
      body: `${mySquad?.name ?? "A rival squad"} is already here. Battle to claim it!`,
      payload: { venueId, sessionId: rival.id },
      pushData: { screen: "ConquestBattle", venueId: String(venueId) },
    }).catch(() => {});

    // Notify Overlord squad if different from both clash squads
    const overlord = await prisma.venueInfTotal.findFirst({
      where: { venueId },
      orderBy: { totalInf: "desc" },
      select: { squadId: true },
    });
    if (overlord && overlord.squadId !== squadId && overlord.squadId !== rival.squadId) {
      notifySquadMembers({
        squadId: overlord.squadId,
        type: "conquest_rival_pulse",
        title: `Territory under threat`,
        body: `${mySquad?.name ?? "A squad"} dropped a pulse at ${venue?.name ?? "your venue"}`,
        payload: { venueId },
        pushData: { screen: "ConquestRadar", venueId: String(venueId) },
      }).catch(() => {});
    }
  } else {
    // No clash, but check if this venue has an Overlord that isn't our squad
    const overlord = await prisma.venueInfTotal.findFirst({
      where: { venueId },
      orderBy: { totalInf: "desc" },
      select: { squadId: true },
    });
    if (overlord && overlord.squadId !== squadId) {
      const [mySquad, venue] = await Promise.all([
        prisma.squad.findUnique({ where: { id: squadId }, select: { name: true } }),
        prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
      ]);
      notifySquadMembers({
        squadId: overlord.squadId,
        type: "conquest_rival_pulse",
        title: `Territory under threat`,
        body: `${mySquad?.name ?? "A squad"} dropped a pulse at ${venue?.name ?? "your venue"}`,
        payload: { venueId },
        pushData: { screen: "ConquestRadar", venueId: String(venueId) },
      }).catch(() => {});
    }
  }

  if (taggedProfileIds && taggedProfileIds.length > 0) {
    const [tagger, venue] = await Promise.all([
      prisma.playerProfile.findUnique({
        where: { id: user.profileId },
        select: { displayName: true, squadNickname: true },
      }),
      prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
    ]);
    const taggerName = tagger?.squadNickname
      ? `@${tagger.squadNickname}`
      : tagger?.displayName?.split(" ")[0] ?? "A teammate";
    const squadInfo = await prisma.squad.findUnique({
      where: { id: squadId },
      select: { name: true },
    });

    for (const taggedId of taggedProfileIds) {
      notifyProfile(taggedId, {
        squadId,
        type: "conquest_tag",
        title: `${taggerName} is at ${venue?.name ?? "a venue"}`,
        body: `Tap to check in and support ${squadInfo?.name ?? "your squad"}`,
        payload: { venueId, taggerProfileId: user.profileId },
        pushData: { screen: "ConquestPulse", venueId: String(venueId) },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    sessionId: session.id,
    autoEndsAt: autoEndsAt.toISOString(),
    clashDetected,
    rivalSquadId,
    cooldownEndsAt: cooldownEndsAt.toISOString(),
  });
}
