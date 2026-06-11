import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { generateSquadCode } from "@/lib/squad-codes";
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

  const { name, emoji, color, isPublic, showDupr } = body as {
    name?: string;
    emoji?: string;
    color?: string;
    isPublic?: boolean;
    showDupr?: boolean;
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

  return NextResponse.json(result, { status: 201 });
}
