import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { ensurePlayerHasPod } from "@/lib/pod-helpers";

export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { squadId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { squadId } = body;
  if (!squadId || typeof squadId !== "string") {
    return NextResponse.json({ error: "squadId required" }, { status: 400 });
  }

  const result = await ensurePlayerHasPod(user.profileId, squadId, null);

  return NextResponse.json({ podId: result.podId, created: result.created });
}
