/**
 * GET /api/clubs/search?q={query}
 * Searches AppClub by name (ILIKE). Returns up to 20 results.
 * Auth: required (JWT).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import type { ClubCardData } from "@/lib/club-card-data";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ clubs: [] });

  const clubs = await prisma.appClub.findMany({
    where: {
      name: { contains: q, mode: "insensitive" },
      privacy: "public",
    },
    select: {
      id: true,
      name: true,
      icon: true,
      tagline: true,
      coverImageUrl: true,
      vibeTag: true,
      _count: { select: { members: true, sessions: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const result: ClubCardData[] = clubs.map((club) => ({
    id: club.id,
    name: club.name,
    icon: club.icon,
    tagline: club.tagline,
    coverImageUrl: club.coverImageUrl,
    vibeTag: club.vibeTag,
    memberCount: club._count.members,
    sessionCount: club._count.sessions,
  }));

  return NextResponse.json({ clubs: result });
}
