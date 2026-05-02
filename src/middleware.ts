import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "admin_session";

/** Compute expected token using Web Crypto (Edge-compatible). */
async function expectedToken(): Promise<string> {
  const secret = process.env.ADMIN_SECRET ?? "";
  const payload = "admin:" + secret;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin/")) return NextResponse.next();
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/"))
    return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (token && token === (await expectedToken())) return NextResponse.next();

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
