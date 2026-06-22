import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { PreferredPlace } from "../route";

/**
 * DELETE /api/play-intent/places/[index]
 * Removes the preferred place at the given 0-based index.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { index } = await params;
  const idx = parseInt(index, 10);
  if (isNaN(idx) || idx < 0) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  });

  const prefs = (profile?.preferences as Record<string, unknown>) ?? {};
  const places = (prefs.preferredPlaces as PreferredPlace[]) ?? [];

  if (idx >= places.length) {
    return NextResponse.json({ error: "Index out of range" }, { status: 404 });
  }

  const updated = [...places.slice(0, idx), ...places.slice(idx + 1)];

  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: { preferences: { ...prefs, preferredPlaces: updated } as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ places: updated });
}
