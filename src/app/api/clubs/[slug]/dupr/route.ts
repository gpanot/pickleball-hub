import { NextRequest, NextResponse } from "next/server";
import { getClubDuprDistribution } from "@/lib/queries";

export const revalidate = 3600;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const data = await getClubDuprDistribution(slug);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Error fetching club DUPR distribution:", error);
    return NextResponse.json({ error: "Failed to fetch DUPR data" }, { status: 500 });
  }
}
