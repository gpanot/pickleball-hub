import { NextRequest, NextResponse } from "next/server";
import { getMarketMedianCostPerHourSeries } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 90;
  try {
    const points = await getMarketMedianCostPerHourSeries(Number.isFinite(days) ? days : 90);
    return NextResponse.json({ points }, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
  } catch (error) {
    console.error("Error fetching market median series:", error);
    return NextResponse.json({ error: "Failed to fetch series" }, { status: 500 });
  }
}
