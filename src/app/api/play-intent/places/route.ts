import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export interface PreferredPlace {
  lat: number;
  lng: number;
  label: string;
  pinnedAt: string; // ISO
}

const MAX_PLACES = 5;

/**
 * GET /api/play-intent/places
 * Returns the player's pinned preferred places array (up to 5).
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  });

  const prefs = (profile?.preferences as Record<string, unknown>) ?? {};
  const places = (prefs.preferredPlaces as PreferredPlace[]) ?? [];

  return NextResponse.json({ places });
}

/**
 * POST /api/play-intent/places
 * Pins a new preferred place (max 5). Body: { lat, lng, label }
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { lat, lng, label } = body ?? {};

  if (typeof lat !== "number" || typeof lng !== "number" || typeof label !== "string") {
    return NextResponse.json({ error: "lat, lng and label are required" }, { status: 400 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  });

  const prefs = (profile?.preferences as Record<string, unknown>) ?? {};
  const existing = (prefs.preferredPlaces as PreferredPlace[]) ?? [];

  if (existing.length >= MAX_PLACES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_PLACES} preferred places allowed` },
      { status: 422 }
    );
  }

  const newPlace: PreferredPlace = { lat, lng, label, pinnedAt: new Date().toISOString() };
  const updated = [...existing, newPlace];

  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: { preferences: { ...prefs, preferredPlaces: updated } },
  });

  return NextResponse.json({ places: updated }, { status: 201 });
}
