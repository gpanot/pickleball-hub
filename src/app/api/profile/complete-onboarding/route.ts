import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { markOnboardingCompleted } from "@/lib/complete-onboarding";

/**
 * POST /api/profile/complete-onboarding
 *
 * Explicit end-of-funnel call, made after the first squad create or join is
 * confirmed and the token-split screen is done. Sets onboardingCompleted=true.
 *
 * Idempotent — safe to call more than once (already-true is not an error).
 * The mobile client retries once on network failure before showing an error state.
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markOnboardingCompleted(user.profileId);

  console.log(`[complete-onboarding] profileId=${user.profileId} — onboardingCompleted set to true`);

  return NextResponse.json({ ok: true });
}
