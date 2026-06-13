import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: squadId, profileId: targetProfileId } = await params;

  if (targetProfileId === user.profileId) {
    return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 });
  }

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { founderId: true, disbandedAt: true },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json({ error: "Only the founder can transfer" }, { status: 403 });
  }

  const targetMembership = await prisma.squadMember.findFirst({
    where: { squadId, profileId: targetProfileId, leftAt: null },
  });

  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.squadMember.updateMany({
      where: { squadId, profileId: targetProfileId, leftAt: null },
      data: { role: "founder" },
    }),
    prisma.squadMember.updateMany({
      where: { squadId, profileId: user.profileId, leftAt: null },
      data: { role: "member" },
    }),
    prisma.squad.update({
      where: { id: squadId },
      data: { founderId: targetProfileId },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
