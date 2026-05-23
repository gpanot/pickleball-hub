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
