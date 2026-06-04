import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { sendToToken } from "@/lib/notifications";

/**
 * POST /api/notifications/test
 * Sends a test push notification to the calling device only (based on platform).
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform, delaySeconds } = (await req.json().catch(() => ({}))) as {
    platform?: string;
    delaySeconds?: number;
  };

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { pushToken: true, pushTokenIos: true, displayName: true },
  });

  const token = platform === "ios" ? profile?.pushTokenIos : profile?.pushToken;

  if (!token) {
    return NextResponse.json(
      { error: `No push token registered for ${platform ?? "unknown"}`, registered: false },
      { status: 400 }
    );
  }

  if (delaySeconds && delaySeconds > 0 && delaySeconds <= 30) {
    await new Promise((r) => setTimeout(r, delaySeconds * 1000));
  }

  const result = await sendToToken(token, {
    title: "Test notification",
    body: `Hey ${profile?.displayName ?? "there"}! Push notifications are working.`,
    data: { type: "test", screen: "Circle" },
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Push send failed",
        code: result.error,
        message: result.message,
        tokenPrefix: token.slice(0, 20),
        registered: true,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, registered: true, delayed: delaySeconds ?? 0 });
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
    select: { pushToken: true, pushTokenIos: true, pushTokenUpdatedAt: true },
  });

  return NextResponse.json({
    registered: !!(profile?.pushToken || profile?.pushTokenIos),
    tokenPrefix: profile?.pushToken?.slice(0, 20) ?? null,
    tokenIosPrefix: profile?.pushTokenIos?.slice(0, 20) ?? null,
    updatedAt: profile?.pushTokenUpdatedAt?.toISOString() ?? null,
  });
}
