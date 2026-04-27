import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token");
  if (!token || token !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    revalidatePath("/");
    revalidatePath("/clubs");
    revalidatePath("/dashboard/organizer");
    revalidatePath("/dashboard/venue");
    revalidatePath("/sessions/[referenceCode]", "page");

    return NextResponse.json({
      revalidated: true,
      revalidatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Revalidation failed" }, { status: 500 });
  }
}
