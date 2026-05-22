import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/players/search?q=<query>
 *
 * Searches players by displayName or username (case-insensitive, prefix + contains).
 * Returns top 10 matches. Requires at least 2 characters.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const players = await prisma.player.findMany({
    where: {
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      userId: true,
      displayName: true,
      username: true,
      imageUrl: true,
      duprDoubles: true,
    },
    take: 10,
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json(
    players.map((p) => ({
      userId: p.userId.toString(),
      displayName: p.displayName,
      username: p.username,
      imageUrl: p.imageUrl,
      duprDoubles: p.duprDoubles ? Number(p.duprDoubles) : null,
    }))
  );
}
