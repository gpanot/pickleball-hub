import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/auth/link-profile
 * Body: { profileId: string }
 *
 * Links an anonymous PlayerProfile to the authenticated User after Google login.
 * Safe to call multiple times — idempotent via updateMany.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json() as { profileId?: string };
  const profileId = body.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  await prisma.playerProfile.updateMany({
    where: { id: profileId, userId: null },
    data: { userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
