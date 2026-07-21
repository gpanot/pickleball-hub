import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { resolveVenueFromGooglePlace } from "@/lib/google-places";

/** POST /api/venues/resolve — link a Google Place to our venues table */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { placeId?: string; venueId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.venueId === "number") {
    const venue = await prisma.venue.findUnique({
      where: { id: body.venueId },
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
    });
    if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    return NextResponse.json({ venue });
  }

  if (!body.placeId || typeof body.placeId !== "string") {
    return NextResponse.json({ error: "placeId or venueId is required" }, { status: 400 });
  }

  try {
    const venue = await resolveVenueFromGooglePlace(body.placeId);
    return NextResponse.json({
      venue: {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        latitude: venue.latitude,
        longitude: venue.longitude,
      },
    });
  } catch (error) {
    console.error("Error resolving venue:", error);
    const message = error instanceof Error ? error.message : "Failed to resolve venue";
    const status = message.includes("GOOGLE_MAPS_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
