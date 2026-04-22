import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const hasDbUrl = !!dbUrl;
  const dbUrlPrefix = dbUrl ? dbUrl.substring(0, 30) + "..." : "NOT SET";

  try {
    const count = await prisma.session.count();
    return NextResponse.json({
      status: "ok",
      hasDbUrl,
      dbUrlPrefix,
      sessionCount: count,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      status: "error",
      hasDbUrl,
      dbUrlPrefix,
      error: message,
    }, { status: 500 });
  }
}
