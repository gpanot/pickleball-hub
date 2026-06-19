import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import {
  awardSquadXp,
  rollChestXp,
  rollChestClubTokens,
  rollChestBrandTokens,
} from "@/lib/squad-xp";
import { getBrandLevelFromXp } from "@/lib/brand-constants";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chestId: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chestId } = await params;

  const chest = await prisma.squadChest.findUnique({
    where: { id: chestId },
    select: { expiresAt: true, squadId: true, earnerId: true },
  });
  if (!chest) {
    return NextResponse.json({ error: "Chest not found" }, { status: 404 });
  }
  if (chest.expiresAt < new Date()) {
    return NextResponse.json({ error: "Chest expired" }, { status: 410 });
  }

  const opening = await prisma.squadChestOpening.findUnique({
    where: { chestId_profileId: { chestId, profileId: user.profileId } },
  });
  if (!opening) {
    return NextResponse.json({ error: "No opening for this user" }, { status: 403 });
  }

  // Allow opening if status is 'ready' OR if unlocks_at has passed (cron may not have updated yet)
  const isReady =
    opening.status === "ready" ||
    (opening.status === "unlocking" && opening.unlocksAt && opening.unlocksAt <= new Date());

  if (!isReady) {
    return NextResponse.json({ error: "Chest not ready yet" }, { status: 403 });
  }

  const isEarner = chest.earnerId === user.profileId;
  const xp = rollChestXp(isEarner);
  const clubTokens = rollChestClubTokens(isEarner);
  const brandTokens = rollChestBrandTokens(isEarner);

  // Fetch player's current brand (if any) before the transaction
  const existingBrand = await prisma.playerBrand.findUnique({
    where: { profileId: user.profileId },
    select: { id: true, brandXp: true },
  });

  await prisma.$transaction(async (tx) => {
    // Mark the opening as opened
    await tx.squadChestOpening.update({
      where: { id: opening.id },
      data: {
        status: "opened",
        openedAt: new Date(),
        xpAwarded: xp,
      },
    });

    // Upsert wallet — credit both token types
    await tx.playerWallet.upsert({
      where: { profileId: user.profileId },
      create: {
        profileId: user.profileId,
        clubTokens,
        brandTokens,
      },
      update: {
        clubTokens: { increment: clubTokens },
        brandTokens: { increment: brandTokens },
      },
    });

    // Ledger: club tokens
    await tx.tokenLedger.create({
      data: {
        profileId: user.profileId,
        tokenType: "club",
        delta: clubTokens,
        reason: "chest_open",
      },
    });

    // Ledger: brand tokens
    await tx.tokenLedger.create({
      data: {
        profileId: user.profileId,
        tokenType: "brand",
        delta: brandTokens,
        reason: "chest_open",
      },
    });

    // Conditionally update brand XP if the player has selected a brand
    if (existingBrand) {
      const newBrandXp = existingBrand.brandXp + brandTokens;
      const newSupportLevel = getBrandLevelFromXp(newBrandXp);
      await tx.playerBrand.update({
        where: { id: existingBrand.id },
        data: { brandXp: newBrandXp, supportLevel: newSupportLevel },
      });
    }
  });

  await awardSquadXp(prisma, chest.squadId, user.profileId, "chest", xp);

  const squad = await prisma.squad.findUnique({
    where: { id: chest.squadId },
    select: { totalXp: true, level: true },
  });

  return NextResponse.json({
    xpAwarded: xp,
    squadLevel: squad?.level ?? 1,
    squadXp: squad?.totalXp ?? 0,
    clubTokensAwarded: clubTokens,
    brandTokensAwarded: brandTokens,
  });
}
