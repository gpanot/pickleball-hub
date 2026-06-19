import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { awardSquadXp } from "@/lib/squad-xp";
import { getBrandLevelFromXp } from "@/lib/brand-constants";

const WELCOME_CLUB_TOKENS = 150;
const WELCOME_BRAND_TOKENS = 50;
const WELCOME_XP = 200;

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { welcomeChestClaimed: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (profile.welcomeChestClaimed) {
    return NextResponse.json({ error: "Welcome chest already claimed" }, { status: 409 });
  }

  // Find the player's active squad (needed for XP award)
  const membership = await prisma.squadMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      squad: { appSlug: "squadd", disbandedAt: null },
    },
    select: { squadId: true },
  });

  // Fetch current brand (if any) to potentially update brandXp
  const existingBrand = await prisma.playerBrand.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, brandXp: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.playerProfile.update({
      where: { id: user.profileId },
      data: { welcomeChestClaimed: true },
    });

    await tx.playerWallet.upsert({
      where: { profileId: user.profileId },
      create: {
        profileId: user.profileId,
        clubTokens: WELCOME_CLUB_TOKENS,
        brandTokens: WELCOME_BRAND_TOKENS,
      },
      update: {
        clubTokens: { increment: WELCOME_CLUB_TOKENS },
        brandTokens: { increment: WELCOME_BRAND_TOKENS },
      },
    });

    await tx.tokenLedger.create({
      data: {
        profileId: user.profileId,
        tokenType: "club",
        delta: WELCOME_CLUB_TOKENS,
        reason: "welcome_chest",
      },
    });

    await tx.tokenLedger.create({
      data: {
        profileId: user.profileId,
        tokenType: "brand",
        delta: WELCOME_BRAND_TOKENS,
        reason: "welcome_chest",
      },
    });

    if (existingBrand) {
      const newBrandXp = existingBrand.brandXp + WELCOME_BRAND_TOKENS;
      await tx.playerBrand.update({
        where: { id: existingBrand.id },
        data: { brandXp: newBrandXp, supportLevel: getBrandLevelFromXp(newBrandXp) },
      });
    }
  });

  // Award squad XP if player is in a squad
  if (membership?.squadId) {
    await awardSquadXp(prisma, membership.squadId, user.profileId, "chest", WELCOME_XP);
  }

  return NextResponse.json({
    clubTokensAwarded: WELCOME_CLUB_TOKENS,
    brandTokensAwarded: WELCOME_BRAND_TOKENS,
    xpAwarded: WELCOME_XP,
  });
}
