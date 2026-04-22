import { NextResponse } from "next/server";
import { getVenues } from "@/lib/queries";

export async function GET() {
  try {
    const venues = await getVenues();
    return NextResponse.json({ venues, count: venues.length });
  } catch (error) {
    console.error("Error fetching venues:", error);
    return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 });
  }
}
