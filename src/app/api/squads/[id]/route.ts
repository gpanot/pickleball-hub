import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import {
  ALLOWED_EMOJIS,
  MAX_SQUAD_NAME_LENGTH,
  MIN_SQUAD_NAME_LENGTH,
} from "@/lib/squad-constants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: squadId } = await params;

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { founderId: true, disbandedAt: true },
  });

  if (!squad || squad.disbandedAt) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  if (squad.founderId !== user.profileId) {
    return NextResponse.json({ error: "Only the founder can edit" }, { status: 403 });
  }

  let body: { name?: string; emoji?: string; isPublic?: boolean; showDupr?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      body.name.length < MIN_SQUAD_NAME_LENGTH ||
      body.name.length > MAX_SQUAD_NAME_LENGTH
    ) {
      return NextResponse.json(
        { error: `Name must be ${MIN_SQUAD_NAME_LENGTH}-${MAX_SQUAD_NAME_LENGTH} characters` },
        { status: 400 }
      );
    }
    data.name = body.name;
  }

  if (body.emoji !== undefined) {
    if (!(ALLOWED_EMOJIS as readonly string[]).includes(body.emoji)) {
      return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
    }
    data.emoji = body.emoji;
  }

  if (body.isPublic !== undefined) data.isPublic = body.isPublic;
  if (body.showDupr !== undefined) data.showDupr = body.showDupr;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.squad.update({
    where: { id: squadId },
    data,
  });

  return NextResponse.json({ ok: true, squad: updated });
}
