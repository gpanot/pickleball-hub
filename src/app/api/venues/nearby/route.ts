import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { findNearbyVenues } from "@/lib/google-places";

/** GET /api/venues/nearby?lat=&lng=&q= — pickleball venues near a GPS point */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const q = searchParams.get("q") ?? undefined;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  try {
    const venues = await findNearbyVenues(lat, lng, q ?? undefined);
    return NextResponse.json({ venues });
  } catch (error) {
    console.error("Error fetching nearby venues:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch nearby venues";
    const status = message.includes("GOOGLE_MAPS_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
