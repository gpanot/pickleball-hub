import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

const MEMBER_PROFILE_SELECT = {
  id: true,
  displayName: true,
  squadNickname: true,
  userId: true,
  user: { select: { image: true } },
} as const;

// GET /api/app-clubs/[id]/members
// Auth: must be an authenticated manager of the club (Owner, Admin, or Host Manager)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only managers may list members
  const isManager = await prisma.appClubManager.findFirst({
    where: { appClubId: id, playerProfileId: user.profileId },
    select: { id: true },
  });
  if (!isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const take = 50;

  const members = await prisma.appClubMember.findMany({
    where: { appClubId: id },
    select: {
      id: true,
      playerProfileId: true,
      joinedAt: true,
      profile: { select: MEMBER_PROFILE_SELECT },
    },
    orderBy: { joinedAt: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = members.length > take;
  const page = hasMore ? members.slice(0, take) : members;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({ members: page, nextCursor });
}
