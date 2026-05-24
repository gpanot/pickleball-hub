import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profileId, zaloId, displayName, preferences, reclubUserId } = body;

    if (!profileId || typeof profileId !== "string") {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const reclubId =
      reclubUserId != null ? BigInt(reclubUserId) : undefined;

    // Mark onboarding complete whenever this endpoint is called with preferences
    // (the onboarding flow always sends preferences, even if the user skips steps).
    const markOnboardingComplete = preferences != null;

    const profile = await prisma.playerProfile.upsert({
      where: { id: profileId },
      create: {
        id: profileId,
        zaloId: zaloId ?? null,
        displayName: displayName ?? null,
        preferences: preferences ?? {},
        reclubUserId: reclubId ?? null,
        onboardingCompleted: markOnboardingComplete,
      },
      update: {
        zaloId: zaloId ?? undefined,
        displayName: displayName ?? undefined,
        preferences: preferences ?? undefined,
        ...(reclubId !== undefined ? { reclubUserId: reclubId } : {}),
        ...(markOnboardingComplete ? { onboardingCompleted: true } : {}),
      },
    });

    return NextResponse.json(profile);
  } catch (err) {
    console.error("[POST /api/profile]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
