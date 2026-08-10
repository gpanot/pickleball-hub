import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { can } from "@/lib/club-permissions";
import { prisma } from "@/lib/db";
import { deleteAppClubsCascade } from "@/lib/delete-app-club-cascade";

const CLUB_SELECT = {
  id: true,
  name: true,
  icon: true,
  sportId: true,
  privacy: true,
  level: true,
  autoApproveNewMembers: true,
  tagline: true,
  coverImageUrl: true,
  vibeTag: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, displayName: true, squadNickname: true } },
  managers: {
    select: {
      id: true,
      playerProfileId: true,
      role: true,
      addedAt: true,
      profile: { select: { id: true, displayName: true, squadNickname: true } },
    },
  },
  _count: { select: { members: true, sessions: true } },
} as const;

// GET /api/app-clubs/[id] — fetch a single club (public)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  const club = await prisma.appClub.findUnique({ where: { id }, select: CLUB_SELECT });
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  // Compute extended profile fields when a viewer is identified
  let circleAtVenue: { followedPlayers: { userId: string; displayName: string | null; imageUrl: string | null }[]; count: number } | null = null;
  let recentMoments: { type: string; playerName: string | null; timestamp: string }[] = [];
  let kudosCloud: { emoji: string; count: number }[] = [];
  let topHost: { userId: string | null; displayName: string | null; imageUrl: string | null; sessionCount: number } | null = null;
  let mySessionCount = 0;

  if (user) {
    try {
      // Players the viewer follows who have played at this club's venues
      const followeeIds = await prisma.follow.findMany({
        where: { follower: { reclubUserId: user.reclubUserId ?? undefined } },
        select: { followeeId: true },
      });      const followeeIdList = followeeIds.map((f) => f.followeeId);

      // Get distinct venues where this AppClub has sessions
      const clubVenues = await prisma.clubSession.findMany({
        where: { appClubId: id, venueId: { not: null } },
        select: { venueId: true },
        distinct: ["venueId"],
        take: 20,
      });
      const venueIds = clubVenues.map((cs) => cs.venueId).filter((v): v is number => v !== null);

      if (followeeIdList.length > 0 && venueIds.length > 0) {
        const playedFollowees = await prisma.sessionRoster.findMany({
          where: {
            userId: { in: followeeIdList },
            isConfirmed: true,
            session: { venueId: { in: venueIds } },
          },
          select: { userId: true },
          distinct: ["userId"],
        });

        const uniqueFollowees = playedFollowees.map((r) => r.userId);
        if (uniqueFollowees.length > 0) {
          const followeePlayers = await prisma.player.findMany({
            where: { userId: { in: uniqueFollowees } },
            select: { userId: true, displayName: true, imageUrl: true },
          });
          circleAtVenue = {
            followedPlayers: followeePlayers.map((p) => ({
              userId: p.userId.toString(),
              displayName: p.displayName,
              imageUrl: p.imageUrl,
            })),
            count: followeePlayers.length,
          };
        }
      }

      // Recent milestone moments in the viewer's feed (recent 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentFeed = await prisma.feedItem.findMany({
        where: {
          profileId: user.profileId,
          type: { in: ["played_today", "streak_milestone", "venue_regular"] },
          timestamp: { gte: thirtyDaysAgo },
        },
        orderBy: { timestamp: "desc" },
        take: 5,
        select: { type: true, playerUserId: true, timestamp: true },
      });

      recentMoments = await Promise.all(
        recentFeed.map(async (f) => {
          const player = f.playerUserId
            ? await prisma.player.findUnique({
                where: { userId: BigInt(f.playerUserId) },
                select: { displayName: true },
              })
            : null;
          return {
            type: f.type,
            playerName: player?.displayName ?? null,
            timestamp: f.timestamp.toISOString(),
          };
        })
      );

      // Kudos cloud
      const kudosCounts = await prisma.kudos.groupBy({
        by: ["type"],
        _count: { type: true },
      });
      const emojiMap: Record<string, string> = { fistbump: "🤜", flame: "🔥", star: "⭐" };
      kudosCloud = kudosCounts.map((k) => ({
        emoji: emojiMap[k.type] ?? k.type,
        count: k._count.type,
      }));

      // My session count at this club's venues
      if (user.reclubUserId && venueIds.length > 0) {
        mySessionCount = await prisma.sessionRoster.count({
          where: {
            userId: user.reclubUserId,
            isConfirmed: true,
            session: { venueId: { in: venueIds } },
          },
        });
      }

      // Top host (most sessions hosted at this club)
      const topHostData = await prisma.clubSession.groupBy({
        by: ["hostId"],
        where: { appClubId: id },
        _count: { hostId: true },
        orderBy: { _count: { hostId: "desc" } },
        take: 1,
      });
      if (topHostData.length > 0) {
        const topHostProfile = await prisma.playerProfile.findUnique({
          where: { id: topHostData[0].hostId },
          select: {
            reclubPlayer: { select: { userId: true, displayName: true, imageUrl: true } },
          },
        });
        if (topHostProfile?.reclubPlayer) {
          topHost = {
            userId: topHostProfile.reclubPlayer.userId.toString(),
            displayName: topHostProfile.reclubPlayer.displayName,
            imageUrl: topHostProfile.reclubPlayer.imageUrl,
            sessionCount: topHostData[0]._count.hostId,
          };
        }
      }
    } catch (err) {
      console.error("[GET /api/app-clubs/[id]] extended fields error:", err);
    }
  }

  return NextResponse.json({
    club,
    circleAtVenue,
    recentMoments,
    kudosCloud,
    topHost,
    mySessionCount,
  });
}

// DELETE /api/app-clubs/[id] — permanently delete a club (Owner only)
// Cascades: sessions → bookings → members → managers → club
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clubExists = await prisma.appClub.findUnique({ where: { id }, select: { id: true } });
  if (!clubExists) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  const authorized = await can(user.profileId, id, "DELETE_CLUB");
  if (!authorized) {
    return NextResponse.json({ error: "Only the club Owner can delete the club" }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await deleteAppClubsCascade(tx, [id]);
    });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    console.error("[DELETE /api/app-clubs/[id]]", err);
    return NextResponse.json({ error: "Failed to delete club" }, { status: 500 });
  }
}

// PATCH /api/app-clubs/[id] — edit club identity fields
// Auth: Owner or Admin (EDIT_CLUB permission)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authorized = await can(user.profileId, id, "EDIT_CLUB");
  if (!authorized) {
    return NextResponse.json({ error: "Only Owners and Admins can edit club settings" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, icon, sportId, privacy, level, autoApproveNewMembers, tagline, coverImageUrl, vibeTag } = body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
      return NextResponse.json({ error: "Club name must be 1–80 characters" }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (icon !== undefined) updates.icon = typeof icon === "string" ? icon : null;
  if (sportId !== undefined) updates.sportId = typeof sportId === "number" ? sportId : null;
  if (privacy !== undefined && (privacy === "public" || privacy === "private")) updates.privacy = privacy;
  if (level !== undefined) updates.level = typeof level === "string" ? level : null;
  if (autoApproveNewMembers !== undefined) updates.autoApproveNewMembers = autoApproveNewMembers !== false;
  if (tagline !== undefined) {
    updates.tagline = typeof tagline === "string" && tagline.trim().length > 0
      ? tagline.trim().slice(0, 60)
      : null;
  }
  if (coverImageUrl !== undefined) {
    updates.coverImageUrl = typeof coverImageUrl === "string" && coverImageUrl.length > 0 ? coverImageUrl : null;
  }
  if (vibeTag !== undefined) {
    updates.vibeTag = typeof vibeTag === "string" && vibeTag.trim().length > 0
      ? vibeTag.trim().slice(0, 30)
      : null;
  }

  try {
    const club = await prisma.appClub.update({
      where: { id },
      data: updates,
      select: CLUB_SELECT,
    });
    return NextResponse.json({ ok: true, club });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") return NextResponse.json({ error: "Club not found" }, { status: 404 });
    console.error("[PATCH /api/app-clubs/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
