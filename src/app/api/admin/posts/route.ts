import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/admin/posts?status=pending|posted|skipped|error */
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const posts = await prisma.contentPost.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ posts });
}
