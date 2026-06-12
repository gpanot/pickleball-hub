import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

/** DELETE /api/squads/:id/members/:profileId — founder removes a member */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: squadId, profileId: targetProfileId } = await params;

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { founderId: true, disbandedAt: true },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json({ error: "Only the founder can remove members" }, { status: 403 });
  }

  if (targetProfileId === user.profileId) {
    return NextResponse.json({ error: "Founder cannot remove themselves" }, { status: 400 });
  }

  const membership = await prisma.squadMember.findFirst({
    where: { squadId, profileId: targetProfileId, leftAt: null },
  });

  if (!membership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await prisma.squadMember.update({
    where: { id: membership.id },
    data: { leftAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
