import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { buildSquadInvitePreview } from "@/lib/squad-invite-preview";

/** GET /api/squads/:id/preview — squad preview for invite-receive screen. */
export async function GET(
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
    },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  const founder = await prisma.playerProfile.findUnique({
    where: { id: squad.founderId },
    select: { displayName: true, squadNickname: true },
  });

  const inviterLabel = founder?.squadNickname
    ? `@${founder.squadNickname}`
    : founder?.displayName ?? null;

  const preview = await buildSquadInvitePreview(
    squad,
    { profileId: user.profileId, reclubUserId: user.reclubUserId },
    inviterLabel,
  );

  return NextResponse.json(preview);
}
