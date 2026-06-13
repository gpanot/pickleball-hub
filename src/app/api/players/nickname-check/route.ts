import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const handle = (searchParams.get("handle") ?? "").trim().toLowerCase();

  if (!handle) {
    return NextResponse.json({ available: false });
  }

  const taken = await prisma.playerProfile.findFirst({
    where: { squadNickname: { equals: handle, mode: "insensitive" } },
    select: { id: true },
  });

  return NextResponse.json({ available: !taken });
}
