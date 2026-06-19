import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { BRAND_BONUSES, type PaddleBrand } from "@/lib/brand-constants";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [playerBrand, wallet] = await Promise.all([
    prisma.playerBrand.findUnique({ where: { profileId: user.profileId } }),
    prisma.playerWallet.findUnique({ where: { profileId: user.profileId } }),
  ]);

  return NextResponse.json({
    brand: playerBrand
      ? {
          id: playerBrand.id,
          brand: playerBrand.brand,
          supportLevel: playerBrand.supportLevel,
          brandXp: playerBrand.brandXp,
          switchedCount: playerBrand.switchedCount,
          bonuses: BRAND_BONUSES[playerBrand.brand as PaddleBrand],
        }
      : null,
    brandTokens: wallet?.brandTokens ?? 0,
  });
}
