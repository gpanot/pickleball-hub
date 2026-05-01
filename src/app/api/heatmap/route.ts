import { NextResponse } from "next/server";
import { getHeatmapData } from "@/lib/queries";

// Revalidate at most once per hour; scraper calls /api/revalidate after DUPR updates
export const revalidate = 3600;

// Edge-compatible cache headers so Vercel CDN caches the response for 1 hour
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
};

export async function GET() {
  try {
    const data = await getHeatmapData();
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("[api/heatmap] Failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
