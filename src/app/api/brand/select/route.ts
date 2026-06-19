import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import {
  PADDLE_BRANDS,
  BRAND_BONUSES,
  getBrandLevelFromXp,
  type PaddleBrand,
} from "@/lib/brand-constants";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { brand } = body as { brand?: string };

  if (!brand || !PADDLE_BRANDS.includes(brand as PaddleBrand)) {
    return NextResponse.json(
      { error: `brand must be one of: ${PADDLE_BRANDS.join(", ")}` },
      { status: 400 },
    );
  }

  const existing = await prisma.playerBrand.findUnique({
    where: { profileId: user.profileId },
  });

  let playerBrand;

  if (!existing) {
    playerBrand = await prisma.playerBrand.create({
      data: {
        profileId: user.profileId,
        brand,
        supportLevel: 1,
        brandXp: 0,
      },
    });
  } else if (existing.brand === brand) {
    // No-op — same brand selected
    playerBrand = existing;
  } else {
    // Brand switch: reset level/XP, keep token wallet balance untouched
    playerBrand = await prisma.playerBrand.update({
      where: { id: existing.id },
      data: {
        brand,
        supportLevel: 1,
        brandXp: 0,
        selectedAt: new Date(),
        switchedCount: { increment: 1 },
      },
    });
  }

  return NextResponse.json({
    id: playerBrand.id,
    brand: playerBrand.brand,
    supportLevel: playerBrand.supportLevel,
    brandXp: playerBrand.brandXp,
    switchedCount: playerBrand.switchedCount,
    bonuses: BRAND_BONUSES[playerBrand.brand as PaddleBrand],
  });
}
