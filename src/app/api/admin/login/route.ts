import { NextRequest, NextResponse } from "next/server";
import { checkPassword, buildSessionCookie } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const body = await request.formData();
  const password = (body.get("password") as string) ?? "";
  const next = (body.get("next") as string) ?? "/admin/content";

  if (!(await checkPassword(password))) {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("error", "1");
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.headers.set("Set-Cookie", await buildSessionCookie());
  return response;
}
