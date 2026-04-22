import { NextResponse } from "next/server";
import { getVenues } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET() {
  try {
    const venues = await getVenues();
    return NextResponse.json(
      { venues, count: venues.length },
      { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } },
    );
  } catch (error) {
    console.error("Error fetching venues:", error);
    return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 });
  }
}
