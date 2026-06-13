import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { generateSquadCode } from "@/lib/squad-codes";
import { awardSquadXp, XP_AMOUNTS } from "@/lib/squad-xp";
import {
  ALLOWED_EMOJIS,
  ALLOWED_COLORS,
  MAX_SQUAD_NAME_LENGTH,
  MIN_SQUAD_NAME_LENGTH,
} from "@/lib/squad-constants";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, emoji, color, isPublic, showDupr, latitude, longitude } = body as {
    name?: string;
    emoji?: string;
    color?: string;
    isPublic?: boolean;
    showDupr?: boolean;
    latitude?: number;
    longitude?: number;
  };

  if (
    !name ||
    typeof name !== "string" ||
    name.length < MIN_SQUAD_NAME_LENGTH ||
    name.length > MAX_SQUAD_NAME_LENGTH
  ) {
    return NextResponse.json(
      { error: `Squad name must be ${MIN_SQUAD_NAME_LENGTH}-${MAX_SQUAD_NAME_LENGTH} characters` },
      { status: 400 }
    );
  }

  if (!emoji || !(ALLOWED_EMOJIS as readonly string[]).includes(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  if (!color || !(ALLOWED_COLORS as readonly string[]).includes(color)) {
    return NextResponse.json({ error: "Invalid color" }, { status: 400 });
  }

  const existingMembership = await prisma.squadMember.findFirst({
    where: {
      profileId: user.profileId,
      leftAt: null,
      squad: { appSlug: "squadd", disbandedAt: null },
    },
  });

  if (existingMembership) {
    return NextResponse.json(
      { error: "You are already in a squad" },
      { status: 409 }
    );
  }

  const code = await generateSquadCode();

  const result = await prisma.$transaction(async (tx) => {
    const squad = await tx.squad.create({
      data: {
        name,
        emoji,
        color,
        isPublic: isPublic !== false,
        showDupr: showDupr !== false,
        founderId: user.profileId,
        ...(typeof latitude === "number" && typeof longitude === "number"
          ? { latitude, longitude }
          : {}),
      },
    });

    await tx.squadCode.create({
      data: { squadId: squad.id, code },
    });

    const member = await tx.squadMember.create({
      data: {
        squadId: squad.id,
        profileId: user.profileId,
        role: "founder",
      },
    });

    return { squad: { ...squad, code }, member };
  });

  // Founder counts as the first member — award +40 XP (one-time, same as joining)
  // hasReceivedNewMemberXp is intentionally NOT checked here: founder never went
  // through join-by-code, so they would never have a prior new_member entry.
  await awardSquadXp(
    prisma,
    result.squad.id,
    user.profileId,
    "new_member",
    XP_AMOUNTS.new_member
  );

  return NextResponse.json(result, { status: 201 });
}
