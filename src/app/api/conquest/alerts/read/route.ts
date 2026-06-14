import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prisma.squadAlert.updateMany({
    where: {
      recipientProfileId: user.profileId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ markedRead: result.count });
}
