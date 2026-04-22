import { NextRequest, NextResponse } from "next/server";
import { getOrganizerAnalytics } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId");
  if (!clubId) {
    return NextResponse.json({ error: "clubId required" }, { status: 400 });
  }

  try {
    const data = await getOrganizerAnalytics(parseInt(clubId));
    if (!data) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching organizer analytics:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
