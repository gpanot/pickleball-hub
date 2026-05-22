import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profileId, zaloId, displayName, preferences, reclubUserId } = body;

    if (!profileId || typeof profileId !== "string") {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const reclubId =
      reclubUserId != null ? BigInt(reclubUserId) : undefined;

    const profile = await prisma.playerProfile.upsert({
      where: { id: profileId },
      create: {
        id: profileId,
        zaloId: zaloId ?? null,
        displayName: displayName ?? null,
        preferences: preferences ?? {},
        reclubUserId: reclubId ?? null,
      },
      update: {
        zaloId: zaloId ?? undefined,
        displayName: displayName ?? undefined,
        preferences: preferences ?? undefined,
        ...(reclubId !== undefined ? { reclubUserId: reclubId } : {}),
      },
    });

    return NextResponse.json(profile);
  } catch (err) {
    console.error("[POST /api/profile]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
