import { NextRequest, NextResponse } from "next/server";
import { getVenues } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search");

  // ?search= branch — lightweight search for VenuePicker (id, name, address only)
  if (search !== null) {
    try {
      const venues = await prisma.venue.findMany({
        where: search.trim()
          ? { name: { contains: search.trim(), mode: "insensitive" } }
          : {},
        select: { id: true, name: true, address: true, latitude: true, longitude: true },
        orderBy: { name: "asc" },
        take: 20,
      });
      return NextResponse.json({ venues });
    } catch (error) {
      console.error("Error searching venues:", error);
      return NextResponse.json({ error: "Failed to search venues" }, { status: 500 });
    }
  }

  // Default branch — full venue listing (existing behaviour)
  try {
    const venues = await getVenues();
    return NextResponse.json(
      { venues, count: venues.length },
      { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } },
    );
  } catch (error) {
    console.error("Error fetching venues:", error);
    return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 });
  }
}
