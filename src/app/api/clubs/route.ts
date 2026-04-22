import { NextResponse } from "next/server";
import { getClubs } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET() {
  try {
    const clubs = await getClubs();
    return NextResponse.json(
      { clubs, count: clubs.length },
      { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } },
    );
  } catch (error) {
    console.error("Error fetching clubs:", error);
    return NextResponse.json({ error: "Failed to fetch clubs" }, { status: 500 });
  }
}
