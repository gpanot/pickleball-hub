import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

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

  return NextResponse.json(
    follows.map((f) => ({
      userId: f.followee.userId.toString(),
      displayName: f.followee.displayName,
      imageUrl: f.followee.imageUrl,
      duprDoubles: f.followee.duprDoubles
        ? Number(f.followee.duprDoubles)
        : null,
      followedAt: f.createdAt.toISOString(),
    }))
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
