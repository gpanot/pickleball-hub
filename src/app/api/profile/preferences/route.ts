/**
 * PATCH /api/profile/preferences
 * Auth: mobile JWT required
 *
 * Merges the provided key-value pairs into the caller's PlayerProfile.preferences
 * JSON without overwriting other existing keys. Primarily used by the Club
 * Sessions Profile screen to save the self-declared DUPR rating.
 *
 * Body: { dupr?: number, gender?: string, market?: string, ... }
 * Returns: { ok: true, preferences: <merged object> }
 */
import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let updates: Record<string, unknown>;
  try {
    updates = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Validate DUPR if provided
  if (updates.dupr !== undefined) {
    const dupr = Number(updates.dupr);
    if (isNaN(dupr) || dupr < 1 || dupr > 8) {
      return NextResponse.json({ error: "dupr must be between 1.00 and 8.00" }, { status: 400 });
    }
    updates.dupr = dupr;
  }

  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { id: user.profileId },
      select: { preferences: true },
    });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const existing =
      profile.preferences && typeof profile.preferences === "object"
        ? (profile.preferences as Record<string, unknown>)
        : {};

    const merged = { ...existing, ...updates };

    const updated = await prisma.playerProfile.update({
      where: { id: user.profileId },
      data: { preferences: merged },
      select: { preferences: true },
    });

    console.log(
      `[PATCH /api/profile/preferences] profileId=${user.profileId}`,
      `keys=${Object.keys(updates).join(",")}`
    );

    return NextResponse.json({ ok: true, preferences: updated.preferences });
  } catch (err) {
    console.error("[PATCH /api/profile/preferences]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
