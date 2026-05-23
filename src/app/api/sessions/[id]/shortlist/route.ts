import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { notifyCircleOfJoining } from "@/lib/notifications/pn1-friend-joining";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;

  // Update last active
  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: { lastActiveAt: new Date() },
  });

  const session = await prisma.session.findUnique({
    where: { id: parseInt(sessionId) },
    include: { venue: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const snapshot = await prisma.dailySnapshot.findFirst({
    where: { sessionId: session.id },
    orderBy: { scrapedAt: "desc" },
  });

  const spotsLeft = session.maxPlayers - (snapshot?.joined ?? 0);

  // Fire-and-forget: notify circle (don't block the response)
  notifyCircleOfJoining({
    profileId: user.profileId,
    sessionName: session.name,
    venueName: session.venue?.name ?? "Unknown venue",
    sessionTime: session.startTime,
    spotsLeft,
    sessionId: sessionId,
  }).catch((err) => console.error("PN1 notification error:", err));

  return NextResponse.json({ ok: true });
}
