import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export interface RecentSpot {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
  lastUsedAt: string; // ISO
}

/**
 * GET /api/play-intent/places/history
 * Returns the player's 10 most recent distinct Conquest venues (RadarSession → Venue),
 * deduplicated by venueId, ordered by most-recently-visited first.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the 50 most recent radar sessions to allow deduplication by venue
  const sessions = await prisma.radarSession.findMany({
    where: { playerId: user.profileId },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      startedAt: true,
      venue: {
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  // Deduplicate by venueId, keep earliest (most-recent) occurrence
  const seen = new Set<string>();
  const spots: RecentSpot[] = [];

  for (const s of sessions) {
    if (!s.venue || seen.has(String(s.venue.id))) continue;
    seen.add(String(s.venue.id));
    spots.push({
      venueId: String(s.venue.id),
      venueName: s.venue.name,
      lat: s.venue.latitude,
      lng: s.venue.longitude,
      lastUsedAt: s.startedAt.toISOString(),
    });
    if (spots.length >= 10) break;
  }

  return NextResponse.json({ history: spots });
}
