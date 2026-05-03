import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/debug/ai-settings — returns live AI chat settings from DB. Remove after debugging. */
export async function GET() {
  try {
    const settings = await prisma.aiChatSettings.findFirst({
      where: { id: "singleton" },
    });
    return NextResponse.json({
      found: !!settings,
      playerFacingEnabled: settings?.playerFacingEnabled ?? null,
      model: settings?.model ?? null,
      updatedAt: settings?.updatedAt ?? null,
      env: {
        hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasAuthSecret: !!process.env.AUTH_SECRET,
        nextauthUrl: process.env.NEXTAUTH_URL ?? null,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
