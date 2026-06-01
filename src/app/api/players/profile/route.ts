import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMobileUser } from "@/lib/mobile-auth";

export async function PATCH(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.reclubUserId) {
    return NextResponse.json(
      { error: "No linked Reclub account" },
      { status: 400 },
    );
  }

  const body = (await req.json()) as { duprRating?: number };

  if (body.duprRating !== undefined) {
    const rating = Number(body.duprRating);
    if (isNaN(rating) || rating < 0 || rating > 8) {
      return NextResponse.json(
        { error: "duprRating must be between 0 and 8" },
        { status: 400 },
      );
    }

    await prisma.player.update({
      where: { userId: BigInt(user.reclubUserId) },
      data: {
        duprDoubles: rating,
        duprUpdatedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
