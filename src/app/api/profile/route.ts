import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getMobileUser(req);
    const body = await req.json();
    const { profileId, zaloId, displayName, preferences, reclubUserId, gender, market } = body;

    // Use authenticated profileId if available, fall back to body for legacy callers
    const resolvedProfileId = user?.profileId ?? profileId;

    if (!resolvedProfileId || typeof resolvedProfileId !== "string") {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const wantsReclubUpdate = Object.prototype.hasOwnProperty.call(body, "reclubUserId");
    const reclubId = wantsReclubUpdate
      ? reclubUserId != null && reclubUserId !== ""
        ? BigInt(reclubUserId)
        : null
      : undefined;

    if (wantsReclubUpdate && reclubUserId == null && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validMarket = market === 'kl' ? 'kl' : market === 'hcm' ? 'hcm' : market === 'us' ? 'us' : undefined;

    // Merge gender and market into preferences JSON if provided
    const mergedPreferences = preferences != null
      ? {
          ...(typeof preferences === 'object' ? preferences : {}),
          ...(gender ? { gender } : {}),
          ...(validMarket ? { market: validMarket } : {}),
        }
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
        // onboardingCompleted is NOT set here — use POST /api/profile/complete-onboarding
      },
      update: {
        zaloId: zaloId ?? undefined,
        displayName: displayName ?? undefined,
        preferences: mergedPreferences ?? undefined,
        ...(genderValue !== undefined ? { gender: genderValue } : {}),
        ...(wantsReclubUpdate ? { reclubUserId: reclubId ?? null } : {}),
        // onboardingCompleted is NOT touched here — use POST /api/profile/complete-onboarding
      },
    });

    console.log(
      `[POST /api/profile] saved profileId=${resolvedProfileId}`,
      `dupr=${(preferences as Record<string, unknown>)?.dupr ?? "n/a"}`,
      `market=${validMarket ?? "unchanged"}`,
      `reclubUserId=${wantsReclubUpdate ? (reclubId?.toString() ?? "null") : "unchanged"}`
    );

    return NextResponse.json({ ok: true, profileId: profile.id });
  } catch (err) {
    console.error("[POST /api/profile]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
