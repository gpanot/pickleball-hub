import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(request: NextRequest) {
  try {
    const mobileUser = await getMobileUser(request);
  let profile: { id: string; reclubUserId: bigint | null } | null = null;
  let distinctId: string | undefined;
  let userEmail: string | undefined;

  if (mobileUser) {
    profile = await prisma.playerProfile.findUnique({
      where: { id: mobileUser.profileId },
      select: { id: true, reclubUserId: true },
    });
    distinctId = mobileUser.userId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    profile = await prisma.playerProfile.findFirst({
      where: { userId: session.user.id },
      select: { id: true, reclubUserId: true },
    });
    distinctId = session.user.id;
    userEmail = session.user.email ?? undefined;
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.reclubUserId === null) {
    return NextResponse.json({ ok: true, alreadyUnlinked: true });
  }

  await prisma.playerProfile.update({
    where: { id: profile.id },
    data: { reclubUserId: null },
  });

  if (distinctId) {
    try {
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId,
        event: "reclub_unlinked",
        properties: {
          profile_id: profile.id,
          user_email: userEmail,
        },
      });
    } catch (err) {
      console.warn("[POST /api/auth/unlink-reclub] posthog capture failed", err);
    }
  }

  return NextResponse.json({ ok: true, unlinked: true });
  } catch (err) {
    console.error("[POST /api/auth/unlink-reclub]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
