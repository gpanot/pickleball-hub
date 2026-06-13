import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { awardSquadXp, type XpSource } from "@/lib/squad-xp";

/**
 * Internal endpoint for the scraper to award XP.
 * Validated by X-Internal-Secret header.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: squadId } = await params;
  const body = await req.json();
  const { source, profileId, amount } = body as {
    source: XpSource;
    profileId: string;
    amount: number;
  };

  if (!source || !amount) {
    return NextResponse.json({ error: "source and amount required" }, { status: 400 });
  }

  await awardSquadXp(prisma, squadId, profileId ?? null, source, amount);

  const squad = await prisma.squad.findUnique({
    where: { id: squadId },
    select: { totalXp: true, level: true },
  });

  return NextResponse.json({ totalXp: squad?.totalXp, level: squad?.level });
}
