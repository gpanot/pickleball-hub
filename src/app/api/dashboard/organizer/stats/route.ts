import { NextRequest, NextResponse } from "next/server";
import { getOrganizerStats, getAllClubsStats } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId");
  const scope = request.nextUrl.searchParams.get("scope");

  if (scope === "all") {
    try {
      const data = await getAllClubsStats();
      return NextResponse.json({ sessions: data }, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
    } catch (error) {
      console.error("Error fetching all clubs stats:", error);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
  }

  if (!clubId) {
    return NextResponse.json({ error: "clubId required" }, { status: 400 });
  }

  try {
    const data = await getOrganizerStats(parseInt(clubId));
    return NextResponse.json({ sessions: data }, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
  } catch (error) {
    console.error("Error fetching organizer stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
