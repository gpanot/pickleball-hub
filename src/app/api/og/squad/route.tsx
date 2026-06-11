import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const squadCode = await prisma.squadCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      squad: {
        include: { members: { where: { leftAt: null } } },
      },
    },
  });

  const squad = squadCode?.squad;
  const name = squad?.name ?? "Unknown Squad";
  const emoji = squad?.emoji ?? "🛡️";
  const memberCount = squad?.members.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ fontSize: 96, marginBottom: 16 }}>{emoji}</div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: "#facc15",
            marginBottom: 12,
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 24, color: "#a1a1aa", marginBottom: 32 }}>
          {memberCount}/8 members · SQUADD
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#a3e635",
            fontWeight: 700,
          }}
        >
          Tap to join free →
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
