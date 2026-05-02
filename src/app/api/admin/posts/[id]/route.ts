import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/posts/[id] — update status, text, post_now flag */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json() as {
    status?: string;
    generatedText?: string;
    postNow?: boolean;
  };

  const allowedStatuses = ["pending", "approved", "skipped", "posted", "error"];
  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.contentPost.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.generatedText !== undefined && { generatedText: body.generatedText }),
      ...(body.postNow !== undefined && { postNow: body.postNow }),
    },
  });

  return NextResponse.json({ post: updated });
}

/** DELETE /api/admin/posts/[id] — hard delete */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.contentPost.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
