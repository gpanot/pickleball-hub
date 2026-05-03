import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/heatmap/ai-enabled — lightweight public endpoint for the client to check live setting */
export async function GET() {
  try {
    const settings = await prisma.aiChatSettings.findFirst({
      where: { id: "singleton" },
      select: { playerFacingEnabled: true },
    });
    return NextResponse.json({ enabled: settings?.playerFacingEnabled ?? false });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
