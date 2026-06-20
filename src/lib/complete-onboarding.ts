import { prisma } from "@/lib/db";

/**
 * Shared completion logic used by:
 *  - POST /api/profile/complete-onboarding (explicit end-of-funnel call)
 *  - GET /api/profile/boot-status auto-heal (onboardingCompleted=false + hasActiveSquad=true)
 */
export async function markOnboardingCompleted(profileId: string): Promise<void> {
  await prisma.playerProfile.update({
    where: { id: profileId },
    data: { onboardingCompleted: true },
  });
}
