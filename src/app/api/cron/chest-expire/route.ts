import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const result = await prisma.squadChestOpening.updateMany({
    where: {
      status: { in: ["pending", "tapped", "unlocking", "ready"] },
      chest: { expiresAt: { lt: now } },
    },
    data: { status: "expired" },
  });

  return NextResponse.json({ expired: result.count });
}
