import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getMobileUser(req);
    const body = await req.json();
    const { profileId, zaloId, displayName, preferences, reclubUserId, gender } = body;

    // Use authenticated profileId if available, fall back to body for legacy callers
    const resolvedProfileId = user?.profileId ?? profileId;

    if (!resolvedProfileId || typeof resolvedProfileId !== "string") {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const reclubId =
      reclubUserId != null ? BigInt(reclubUserId) : undefined;

    const markOnboardingComplete = preferences != null;

    // If reclubUserId is being set, clear it from any other profile first
    // (unique constraint — one Reclub account per app user)
    if (reclubId !== undefined) {
      await prisma.playerProfile.updateMany({
        where: {
          reclubUserId: reclubId,
          NOT: { id: resolvedProfileId },
        },
        data: { reclubUserId: null },
      });
    }

    // Merge gender into preferences JSON if provided
    const mergedPreferences = preferences != null
      ? { ...(typeof preferences === 'object' ? preferences : {}), ...(gender ? { gender } : {}) }
      : undefined;

    const genderValue = typeof gender === 'string' && gender.trim() ? gender.trim() : undefined;

    const profile = await prisma.playerProfile.upsert({
      where: { id: resolvedProfileId },
      create: {
        id: resolvedProfileId,
        zaloId: zaloId ?? null,
        displayName: displayName ?? null,
        gender: genderValue ?? null,
        preferences: mergedPreferences ?? {},
        reclubUserId: reclubId ?? null,
        onboardingCompleted: markOnboardingComplete,
      },
      update: {
        zaloId: zaloId ?? undefined,
        displayName: displayName ?? undefined,
        preferences: mergedPreferences ?? undefined,
        ...(genderValue !== undefined ? { gender: genderValue } : {}),
        ...(reclubId !== undefined ? { reclubUserId: reclubId } : {}),
        ...(markOnboardingComplete ? { onboardingCompleted: true } : {}),
      },
    });

    console.log(
      `[POST /api/profile] saved profileId=${resolvedProfileId}`,
      `dupr=${(preferences as Record<string, unknown>)?.dupr ?? "n/a"}`,
      `reclubUserId=${reclubId ?? "unchanged"}`
    );

    return NextResponse.json({ ok: true, profileId: profile.id });
  } catch (err) {
    console.error("[POST /api/profile]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
