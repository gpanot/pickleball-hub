import { NextRequest, NextResponse } from "next/server";
import { getVenueAnalytics } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId");
  if (!venueId) {
    return NextResponse.json({ error: "venueId required" }, { status: 400 });
  }

  try {
    const data = await getVenueAnalytics(parseInt(venueId));
    if (!data) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
  } catch (error) {
    console.error("Error fetching venue analytics:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
