import { NextRequest, NextResponse } from "next/server";
import { getClubComparison } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const clubIds = ids.split(",").map(Number).filter(Boolean);
  if (clubIds.length === 0) {
    return NextResponse.json({ error: "No valid IDs" }, { status: 400 });
  }

  try {
    const data = await getClubComparison(clubIds);
    return NextResponse.json(
      { clubs: data },
      { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } },
    );
  } catch (error) {
    console.error("Error comparing clubs:", error);
    return NextResponse.json({ error: "Failed to compare clubs" }, { status: 500 });
  }
}
