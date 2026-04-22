import { NextRequest, NextResponse } from "next/server";
import { getSessions, type SessionFilters } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filters: SessionFilters = {};
  if (searchParams.get("date")) filters.date = searchParams.get("date")!;
  if (searchParams.get("timeSlot")) filters.timeSlot = searchParams.get("timeSlot") as SessionFilters["timeSlot"];
  if (searchParams.get("minSkill")) filters.minSkill = parseFloat(searchParams.get("minSkill")!);
  if (searchParams.get("freeOnly") === "true") {
    filters.freeOnly = true;
  } else if (searchParams.get("maxPrice")) {
    filters.maxPrice = parseInt(searchParams.get("maxPrice")!);
  }
  if (searchParams.get("availability")) filters.availability = searchParams.get("availability") as SessionFilters["availability"];
  if (searchParams.get("clubSlug")) filters.clubSlug = searchParams.get("clubSlug")!;
  if (searchParams.get("venueId")) filters.venueId = parseInt(searchParams.get("venueId")!);
  if (searchParams.get("hasPerks")) filters.hasPerks = searchParams.get("hasPerks") === "true";
  if (searchParams.get("search")) filters.search = searchParams.get("search")!;

  try {
    const sessions = await getSessions(filters);
    return NextResponse.json(
      { sessions, count: sessions.length },
      { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } },
    );
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
