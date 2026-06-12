import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";
import { reclubAvatarUrl } from "@/lib/utils";
import { notifyNewFollower } from "@/lib/notifications/pn4-new-follower";

/**
 * GET /api/follows
 * Returns the list of players the current user follows.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: user.profileId },
    include: {
      followee: {
        select: {
          userId: true,
          displayName: true,
          imageUrl: true,
          duprDoubles: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const followeeIds = follows.map((f) => f.followee.userId);
  const profiles = await prisma.playerProfile.findMany({
    where: { reclubUserId: { in: followeeIds } },
    select: { id: true, reclubUserId: true },
  });
  const profileIds = profiles.map((p) => p.id);
  const squadMemberships = await prisma.squadMember.findMany({
    where: { profileId: { in: profileIds }, leftAt: null },
    select: { profileId: true, squad: { select: { name: true } } },
  });
  const squadByProfileId = new Map(
    squadMemberships.map((m) => [m.profileId, m.squad.name]),
  );
  const profileByReclubId = new Map(
    profiles.map((p) => [
      p.reclubUserId!.toString(),
      { profileId: p.id, hasSquad: squadByProfileId.has(p.id), squadName: squadByProfileId.get(p.id) ?? null },
    ]),
  );

  return NextResponse.json(
    follows.map((f) => {
      const reclubId = f.followee.userId.toString();
      const linked = profileByReclubId.get(reclubId);
      return {
        userId: reclubId,
        profileId: linked?.profileId ?? null,
        hasSquad: linked?.hasSquad ?? false,
        squadName: linked?.squadName ?? null,
        displayName: f.followee.displayName,
        imageUrl:
          f.followee.imageUrl ?? reclubAvatarUrl(f.followee.userId),
        duprDoubles: f.followee.duprDoubles
          ? Number(f.followee.duprDoubles)
          : null,
        followedAt: f.createdAt.toISOString(),
      };
    }),
  );
}

/**
 * POST /api/follows
 * Body: { followeeId: string }
 * Creates a follow relationship.
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { followeeId } = (await req.json()) as { followeeId?: string };
  if (!followeeId) {
    return NextResponse.json(
      { error: "followeeId required" },
      { status: 400 }
    );
  }

  try {
    await prisma.follow.create({
      data: {
        followerId: user.profileId,
        followeeId: BigInt(followeeId),
      },
    });

    // Fire-and-forget: notify the followee
    notifyNewFollower({
      followerProfileId: user.profileId,
      followeeReclubUserId: BigInt(followeeId),
    }).catch((err) => console.error("PN4 notification error:", err));

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === "P2002") {
      return NextResponse.json({ ok: true });
    }
    throw err;
  }
}

/**
 * DELETE /api/follows
 * Body: { followeeId: string }
 * Removes a follow relationship.
 */
export async function DELETE(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { followeeId } = (await req.json()) as { followeeId?: string };
  if (!followeeId) {
    return NextResponse.json(
      { error: "followeeId required" },
      { status: 400 }
    );
  }

  await prisma.follow.deleteMany({
    where: {
      followerId: user.profileId,
      followeeId: BigInt(followeeId),
    },
  });

  return NextResponse.json({ ok: true });
}
