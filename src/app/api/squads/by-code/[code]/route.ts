import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { buildSquadInvitePreview } from "@/lib/squad-invite-preview";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getMobileUser(req);

  const squadCode = await prisma.squadCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      squad: {
        include: {
          members: {
            where: { leftAt: null },
            include: {
              profile: {
                select: {
                  id: true,
                  displayName: true,
                  reclubUserId: true,
                  reclubPlayer: {
                    select: { imageUrl: true, duprDoubles: true },
                  },
                },
              },
            },
          },
          founder: { select: { displayName: true } },
        },
      },
    },
  });

  if (!squadCode || squadCode.squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  const { squad } = squadCode;
  const preview = await buildSquadInvitePreview(
    squad,
    user
      ? { profileId: user.profileId, reclubUserId: user.reclubUserId }
      : undefined,
    squad.founder.displayName,
  );

  return NextResponse.json(preview);
}
