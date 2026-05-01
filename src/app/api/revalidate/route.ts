import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token");
  if (!token || token !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: ?tag=heatmap to revalidate only heatmap data (called after DUPR refresh)
  const tag = new URL(req.url).searchParams.get("tag");

  try {
    if (tag === "heatmap") {
      revalidatePath("/api/heatmap");
      revalidatePath("/heatmap");
    } else {
      revalidatePath("/");
      revalidatePath("/clubs");
      revalidatePath("/sessions/[referenceCode]", "page");
      revalidatePath("/dashboard/organizer");
      revalidatePath("/dashboard/venue");
      revalidatePath("/heatmap");
      revalidatePath("/api/heatmap");
    }

    return NextResponse.json({
      revalidated: true,
      tag: tag ?? "all",
      revalidatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Revalidation failed" }, { status: 500 });
  }
}
