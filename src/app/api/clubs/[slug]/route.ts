import { NextRequest, NextResponse } from "next/server";
import { getClubBySlug } from "@/lib/queries";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

// Cache this route for 1 hour via Next.js ISR — club data changes at most a few times per day.
// On Vercel, the CDN also holds the response via the Cache-Control header below.
export const revalidate = 3600;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const club = await getClubBySlug(slug);
    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }
    return NextResponse.json(club, { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } });
  } catch (error) {
    console.error("Error fetching club:", error);
    return NextResponse.json({ error: "Failed to fetch club" }, { status: 500 });
  }
}
