import { NextResponse } from "next/server";
import { getHeatmapData } from "@/lib/queries";

// No ISR (revalidate) — use CDN Cache-Control only to avoid ISR write units.
// Scraper calls POST /api/revalidate after updates; between scrapes the CDN serves stale.
export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
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
