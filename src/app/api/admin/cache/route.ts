import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminAuthenticated } from "@/lib/admin-auth";

const ALLOWED_TAGS = ["heatmap", "dupr-distribution"] as const;
type AllowedTag = (typeof ALLOWED_TAGS)[number];

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tag?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tag } = body;

  if (!tag || !(ALLOWED_TAGS as readonly string[]).includes(tag)) {
    return NextResponse.json(
      { error: `Invalid tag. Must be one of: ${ALLOWED_TAGS.join(", ")}` },
      { status: 400 },
    );
  }

  revalidateTag(tag as AllowedTag);

  return NextResponse.json({
    success: true,
    tag,
    clearedAt: new Date().toISOString(),
  });
}
