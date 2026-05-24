import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { sendPushNotification } from "@/lib/notifications";

/**
 * POST /api/notifications/test
 * Sends a test push notification to the calling user's registered device.
 * Used for debugging PNS setup.
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { pushToken: true, displayName: true },
  });

  if (!profile?.pushToken) {
    return NextResponse.json(
      { error: "No push token registered", registered: false },
      { status: 400 }
    );
  }

  const result = await sendPushNotification({
    token: profile.pushToken,
    title: "Test notification",
    body: `Hey ${profile.displayName ?? "there"}! Push notifications are working.`,
    data: { type: "test", screen: "Circle" },
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Push send failed",
        code: result.error,
        message: result.message,
        tokenPrefix: profile.pushToken.slice(0, 20),
        registered: true,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, registered: true });
}

/**
 * GET /api/notifications/test
 * Returns PNS registration status for the calling user.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { pushToken: true, pushTokenUpdatedAt: true },
  });

  return NextResponse.json({
    registered: !!profile?.pushToken,
    tokenPrefix: profile?.pushToken?.slice(0, 20) ?? null,
    updatedAt: profile?.pushTokenUpdatedAt?.toISOString() ?? null,
  });
}
