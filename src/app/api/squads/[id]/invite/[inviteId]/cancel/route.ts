import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

/** DELETE /api/squads/:id/invite/:inviteId/cancel — founder revokes a pending invite. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId, inviteId } = await params;
  const inviteIdNum = parseInt(inviteId, 10);

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { founderId: true, disbandedAt: true },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }

  const invite = await prisma.squadInvite.findFirst({
    where: { id: inviteIdNum, squadId },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Only pending invites can be removed" }, { status: 409 });
  }

  await prisma.squadInvite.update({
    where: { id: inviteIdNum },
    data: { status: "cancelled", resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
