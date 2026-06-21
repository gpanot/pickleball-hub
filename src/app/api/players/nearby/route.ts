import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/squad-geo";
import { reclubAvatarUrl } from "@/lib/utils";

/**
 * GET /api/players/nearby?lat=&lng=&limit=20
 *
 * Returns up to `limit` (default 20) players sorted by distance from the given
 * coordinates. Distance is approximated from their most-recent RadarSession venue.
 * Players with no location history are appended at the end, sorted by lastSeenAt.
 *
 * Excludes the calling user.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  // Pull the 200 most recently active players (gives us a good pool to sort from).
  const players = await prisma.player.findMany({
    where: {
      userId: { not: user.reclubUserId ? BigInt(user.reclubUserId) : undefined },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    select: {
      userId: true,
      displayName: true,
      username: true,
      imageUrl: true,
      duprDoubles: true,
      lastSeenAt: true,
      profile: {
        select: {
          id: true,
          squadMemberships: {
            where: { leftAt: null },
            select: { squad: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });

  // If we have a location, look up last-known venues via RadarSessions.
  let venueLatLngByProfileId = new Map<string, { lat: number; lng: number }>();
  if (hasLocation) {
    const profileIds = players.flatMap((p) => (p.profile ? [p.profile.id] : []));
    if (profileIds.length > 0) {
      // One radar session per player — the most recent one.
      const radarRows = await prisma.radarSession.findMany({
        where: { playerId: { in: profileIds } },
        orderBy: { startedAt: "desc" },
        distinct: ["playerId"],
        select: {
          playerId: true,
          venue: { select: { latitude: true, longitude: true } },
        },
      });
      for (const row of radarRows) {
        venueLatLngByProfileId.set(row.playerId, {
          lat: row.venue.latitude,
          lng: row.venue.longitude,
        });
      }
    }
  }

  const enriched = players.map((p) => {
    const profileId = p.profile?.id ?? null;
    const hasSquad = (p.profile?.squadMemberships?.length ?? 0) > 0;
    const squadName = p.profile?.squadMemberships?.[0]?.squad?.name ?? null;

    let distanceKm: number | null = null;
    if (hasLocation && profileId) {
      const loc = venueLatLngByProfileId.get(profileId);
      if (loc) {
        distanceKm = haversineKm(lat, lng, loc.lat, loc.lng);
      }
    }

    return {
      userId: p.userId.toString(),
      profileId,
      displayName: p.displayName,
      username: p.username,
      imageUrl: p.imageUrl ?? reclubAvatarUrl(p.userId),
      duprDoubles: p.duprDoubles ? Number(p.duprDoubles) : null,
      hasSquad,
      squadName,
      distanceKm,
    };
  });

  // Sort: players with a known distance first (nearest first), then by lastSeenAt.
  enriched.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return 0;
  });

  return NextResponse.json({ players: enriched.slice(0, limit) });
}
