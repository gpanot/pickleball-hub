import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { squadId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { squadId } = body;
  if (!squadId) {
    return NextResponse.json({ error: "squadId required" }, { status: 400 });
  }

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    include: { code: true },
  });

  if (!squad || !squad.code) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  const recentShare = await prisma.squadInvite.findFirst({
    where: {
      squadId,
      inviterId: user.profileId,
      inviteChannel: "link",
      lastResentAt: { gte: new Date(Date.now() - RATE_LIMIT_MS) },
    },
  });

  const joinUrl = `https://hub.thecourtflow.com/join/${squad.code.code}`;
  const cardUrl = `https://hub.thecourtflow.com/api/og/squad?code=${squad.code.code}`;

  if (recentShare) {
    return NextResponse.json({ url: joinUrl, cardUrl, rateLimited: true });
  }

  await prisma.squadInvite.create({
    data: {
      squadId,
      inviterId: user.profileId,
      inviteChannel: "link",
      status: "pending",
      lastResentAt: new Date(),
    },
  });

  return NextResponse.json({ url: joinUrl, cardUrl });
}
