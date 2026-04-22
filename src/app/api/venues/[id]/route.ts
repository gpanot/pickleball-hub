import { NextRequest, NextResponse } from "next/server";
import { getVenueById } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const venueId = parseInt(id);

  if (isNaN(venueId)) {
    return NextResponse.json({ error: "Invalid venue ID" }, { status: 400 });
  }

  try {
    const venue = await getVenueById(venueId);
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }
    return NextResponse.json(venue, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
  } catch (error) {
    console.error("Error fetching venue:", error);
    return NextResponse.json({ error: "Failed to fetch venue" }, { status: 500 });
  }
}
