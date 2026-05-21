import { NextRequest, NextResponse } from "next/server";
import { getMarketPlayersPerDay } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

const ALLOWED_DAYS = [30, 60, 90];

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  if (!ALLOWED_DAYS.includes(days)) {
    return NextResponse.json({ error: "days must be 30, 60, or 90" }, { status: 400 });
  }

  try {
    const data = await getMarketPlayersPerDay(days);
    return NextResponse.json({ data }, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
  } catch (error) {
    console.error("Error fetching market players per day:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
