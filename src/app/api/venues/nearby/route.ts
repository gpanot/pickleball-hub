import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/squad-geo";

/** GET /api/venues/nearby?lat=&lng=&radiusKm=15 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  let radiusKm = parseFloat(searchParams.get("radiusKm") ?? "15");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = 15;
  if (radiusKm > 100) radiusKm = 100;

  const venues = await prisma.venue.findMany({
    select: { id: true, name: true, address: true, latitude: true, longitude: true },
  });

  const withDistance = venues
    .map((v) => ({
      id: v.id,
      name: v.name,
      address: v.address,
      distance: Math.round(haversineKm(lat, lng, v.latitude, v.longitude) * 10) / 10,
    }))
    .sort((a, b) => a.distance - b.distance);

  let nearby = withDistance.filter((v) => v.distance <= radiusKm).slice(0, 20);
  let fallback = false;

  // No venues in radius — return closest courts so dev/testing can proceed
  if (nearby.length === 0 && withDistance.length > 0) {
    nearby = withDistance.slice(0, 15);
    fallback = true;
  }

  return NextResponse.json({ venues: nearby, fallback });
}
