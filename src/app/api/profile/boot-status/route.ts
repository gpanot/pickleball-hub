import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { markOnboardingCompleted } from "@/lib/complete-onboarding";

/**
 * GET /api/profile/boot-status
 *
 * Single server-authoritative response used by the mobile app on every JWT hydrate.
 * Returns both onboardingCompleted and hasActiveSquad so the client never needs to
 * call two endpoints and sequence them.
 *
 * Auto-heal: if onboardingCompleted=false but the user already has an active squad
 * (interrupted funnel, network drop before complete-onboarding landed), we set the
 * flag server-side and return the corrected state. The client never sees the
 * inconsistent combination. A PostHog-compatible event key is logged for tracking.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: {
      onboardingCompleted: true,
      welcomeChestClaimed: true,
      preferences: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const activeSquadMember = await prisma.squadMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      squad: { appSlug: "squadd", disbandedAt: null },
    },
    select: { id: true },
  });

  const hasActiveSquad = activeSquadMember !== null;
  let onboardingCompleted = profile.onboardingCompleted;

  // Auto-heal: squad exists but flag was never set (interrupted funnel / pre-PR1 data)
  const wasAutoHealed = !onboardingCompleted && hasActiveSquad;
  if (wasAutoHealed) {
    console.log(
      `[boot-status] auto-heal: profileId=${user.profileId} has active squad but onboardingCompleted=false — correcting`
    );
    await markOnboardingCompleted(user.profileId);
    onboardingCompleted = true;
    // The client receives autoHealed=true and fires a PostHog event for observability.
  }

  const prefs = (profile.preferences as Record<string, unknown>) ?? {};
  const market = prefs.market ?? null;

  return NextResponse.json({
    onboardingCompleted,
    hasActiveSquad,
    welcomeChestClaimed: profile.welcomeChestClaimed,
    market,
    autoHealed: wasAutoHealed,
  });
}
