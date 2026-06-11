import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId, inviteId } = await params;
  const inviteIdNum = parseInt(inviteId, 10);

  const invite = await prisma.squadInvite.findFirst({
    where: { id: inviteIdNum, squadId },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.inviteeId !== user.profileId) {
    return NextResponse.json({ error: "Not your invite" }, { status: 403 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invite already resolved" }, { status: 409 });
  }

  await prisma.squadInvite.update({
    where: { id: inviteIdNum },
    data: { status: "declined", resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
