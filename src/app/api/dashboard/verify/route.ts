import { NextRequest, NextResponse } from "next/server";
import { verifyAccessCode } from "@/lib/queries";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const accessCode = await verifyAccessCode(code);
    if (!accessCode) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    return NextResponse.json({
      entityType: accessCode.entityType,
      clubId: accessCode.clubId,
      venueId: accessCode.venueId,
      label: accessCode.label,
      club: accessCode.club,
      venue: accessCode.venue,
    });
  } catch (error) {
    console.error("Error verifying code:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
