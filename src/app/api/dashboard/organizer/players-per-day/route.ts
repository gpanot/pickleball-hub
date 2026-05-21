import { NextRequest, NextResponse } from "next/server";
import { getPlayersPerDay } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

const ALLOWED_DAYS = [30, 90, 180];

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId");
  const daysParam = request.nextUrl.searchParams.get("days");

  if (!clubId) {
    return NextResponse.json({ error: "clubId required" }, { status: 400 });
  }

  const days = daysParam ? parseInt(daysParam, 10) : 30;
  if (!ALLOWED_DAYS.includes(days)) {
    return NextResponse.json({ error: "days must be 30, 90, or 180" }, { status: 400 });
  }

  try {
    const data = await getPlayersPerDay(parseInt(clubId, 10), days);
    return NextResponse.json({ data }, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
  } catch (error) {
    console.error("Error fetching players per day:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
