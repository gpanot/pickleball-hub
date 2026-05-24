import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = (await req.json()) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  if (token.startsWith("ExponentPushToken")) {
    console.warn(
      "[push-token] Received Expo format token instead of native FCM token for profile",
      user.profileId,
      "— token prefix:", token.slice(0, 30)
    );
  }

  console.log(
    "[push-token] Saving token for profile", user.profileId,
    "— type:", token.startsWith("ExponentPushToken") ? "expo" : "native",
    "prefix:", token.slice(0, 20)
  );

  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: {
      pushToken: token,
      pushTokenUpdatedAt: new Date(),
      lastActiveAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
