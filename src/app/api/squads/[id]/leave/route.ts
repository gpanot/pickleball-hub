import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  if (squad.founderId === user.profileId) {
    return NextResponse.json(
      { error: "Founders cannot leave — disband the squad instead" },
      { status: 403 }
    );
  }

  const membership = await prisma.squadMember.findFirst({
    where: { squadId, profileId: user.profileId, leftAt: null },
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this squad" }, { status: 404 });
  }

  await prisma.squadMember.update({
    where: { id: membership.id },
    data: { leftAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
