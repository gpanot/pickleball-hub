import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallet = await prisma.playerWallet.upsert({
    where: { profileId: user.profileId },
    create: { profileId: user.profileId, clubTokens: 0, brandTokens: 0 },
    update: {},
  });

  return NextResponse.json({
    clubTokens: wallet.clubTokens,
    brandTokens: wallet.brandTokens,
  });
}
