import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { buildSquadInvitePreview } from "@/lib/squad-invite-preview";

/** GET /api/squads/pending-invite — returns the newest pending invite for the current user. */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invite = await prisma.squadInvite.findFirst({
    where: {
      inviteeId: user.profileId,
      status: "pending",
      squad: { disbandedAt: null },
    },
    orderBy: { createdAt: "desc" },
    include: {
      inviter: { select: { displayName: true, squadNickname: true } },
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
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ invite: null });
  }

  const inviterLabel = invite.inviter.squadNickname
    ? `@${invite.inviter.squadNickname}`
    : invite.inviter.displayName ?? null;

  const preview = await buildSquadInvitePreview(
    invite.squad,
    { profileId: user.profileId, reclubUserId: user.reclubUserId },
    inviterLabel,
  );

  return NextResponse.json({
    invite: {
      id: invite.id,
      squadId: invite.squad.id,
      preview,
    },
  });
}
