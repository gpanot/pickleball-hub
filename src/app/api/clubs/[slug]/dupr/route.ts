import { NextRequest, NextResponse } from "next/server";
import { getClubDuprDistribution } from "@/lib/queries";

// No ISR — CDN Cache-Control handles caching. DUPR data updates weekly.
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const data = await getClubDuprDistribution(slug);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("Error fetching club DUPR distribution:", error);
    return NextResponse.json({ error: "Failed to fetch DUPR data" }, { status: 500 });
  }
}
