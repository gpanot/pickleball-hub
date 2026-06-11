import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

/** DELETE /api/squads/:id/disband — founder disbands the squad. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId } = await params;

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json(
      { error: "Only the founder can delete the squad" },
      { status: 403 },
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.squadMember.updateMany({
      where: { squadId, leftAt: null },
      data: { leftAt: now },
    }),
    prisma.squadInvite.updateMany({
      where: {
        squadId,
        status: { in: ["pending", "not_on_app"] },
      },
      data: { status: "cancelled", resolvedAt: now },
    }),
    prisma.squad.update({
      where: { id: squadId },
      data: { disbandedAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
