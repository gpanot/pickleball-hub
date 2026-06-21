import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  });

  return NextResponse.json({ preferences: profile?.preferences ?? {} });
}

export async function PATCH(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    duprRating?: number
    handle?: string
    playstyles?: string[]
    preferences?: Record<string, unknown>
  }

  if (body.handle !== undefined) {
    const handle = body.handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      return NextResponse.json(
        { error: "Handle must be 3-20 characters: letters, numbers, underscores only" },
        { status: 400 },
      );
    }

    const me = await prisma.playerProfile.findUnique({
      where: { id: user.profileId },
      select: { squadNickname: true, squadNicknameSetAt: true },
    });

    if (me?.squadNicknameSetAt && me.squadNickname?.toLowerCase() !== handle) {
      const daysSince =
        (Date.now() - new Date(me.squadNicknameSetAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        const nextAvailableAt = new Date(
          new Date(me.squadNicknameSetAt).getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString();
        return NextResponse.json(
          { error: "cooldown", nextAvailableAt },
          { status: 429 },
        );
      }
    }

    const taken = await prisma.playerProfile.findFirst({
      where: {
        squadNickname: { equals: handle, mode: "insensitive" },
        id: { not: user.profileId },
      },
      select: { id: true },
    });

    if (taken) {
      return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
    }

    await prisma.playerProfile.update({
      where: { id: user.profileId },
      data: { squadNickname: handle, squadNicknameSetAt: new Date() },
    });

    return NextResponse.json({ ok: true, handle });
  }

  if (body.duprRating !== undefined) {
    if (!user.reclubUserId) {
      return NextResponse.json(
        { error: "No linked Reclub account" },
        { status: 400 },
      );
    }
    const rating = Number(body.duprRating);
    if (isNaN(rating) || rating < 0 || rating > 8) {
      return NextResponse.json(
        { error: "duprRating must be between 0 and 8" },
        { status: 400 },
      );
    }

    await prisma.player.update({
      where: { userId: BigInt(user.reclubUserId) },
      data: {
        duprDoubles: rating,
        duprUpdatedAt: new Date(),
      },
    });

    // Keep preferences.dupr in sync so reinstalls can read it from mobile-token
    const currentProfile = await prisma.playerProfile.findUnique({
      where: { id: user.profileId },
      select: { preferences: true },
    });
    const currentPrefs =
      (currentProfile?.preferences as Record<string, unknown>) ?? {};
    await prisma.playerProfile.update({
      where: { id: user.profileId },
      data: { preferences: { ...currentPrefs, dupr: rating } },
    });

    console.log(
      `[DUPR_DEBUG] saved: profileId=${user.profileId} reclubUserId=${user.reclubUserId} duprDoubles=${rating}`
    );
  }

  if (body.playstyles !== undefined) {
    const VALID = ['partner', 'friend', 'group', 'colleagues', 'open_play', 'solo'];
    const playstyles = (Array.isArray(body.playstyles) ? body.playstyles : [])
      .filter((s) => VALID.includes(s))
      .slice(0, 2);

    const currentProfile = await prisma.playerProfile.findUnique({
      where: { id: user.profileId },
      select: { preferences: true },
    });
    const currentPrefs = (currentProfile?.preferences as Record<string, unknown>) ?? {};
    await prisma.playerProfile.update({
      where: { id: user.profileId },
      data: { preferences: { ...currentPrefs, playstyles } },
    });

    return NextResponse.json({ ok: true, playstyles });
  }

  // Generic preferences merge — used by engagement layer and other feature flags
  if (body.preferences !== undefined && typeof body.preferences === 'object') {
    const ALLOWED_KEYS = [
      'engagementPlayStyle', 'playWindow', 'vibeTag',
      'dayOneIntentShown', 'dayOneIntent', 'intentMatchLog',
      'engagementBackoff', 'timezone',
    ]
    const filtered = Object.fromEntries(
      Object.entries(body.preferences).filter(([k]) => ALLOWED_KEYS.includes(k))
    )
    if (Object.keys(filtered).length > 0) {
      const currentProfile = await prisma.playerProfile.findUnique({
        where: { id: user.profileId },
        select: { preferences: true },
      })
      const currentPrefs = (currentProfile?.preferences as Record<string, unknown>) ?? {}
      const merged = { ...currentPrefs, ...filtered }
      await prisma.playerProfile.update({
        where: { id: user.profileId },
        data: { preferences: merged as Parameters<typeof prisma.playerProfile.update>[0]['data']['preferences'] },
      })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true });
}
