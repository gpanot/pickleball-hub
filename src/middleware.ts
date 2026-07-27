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

/** HTTP Basic Auth gate for the entire site.
 *  Enabled when both SITE_USER and SITE_PASSWORD env vars are set.
 *  Returns a 401 response if credentials are missing or wrong, otherwise null.
 */
function basicAuthCheck(request: NextRequest): NextResponse | null {
  const siteUser = process.env.SITE_USER;
  const sitePassword = process.env.SITE_PASSWORD;

  // If env vars are not configured, skip the gate
  if (!siteUser || !sitePassword) return null;

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Basic ")) {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const colonIdx = decoded.indexOf(":");
    const user = decoded.slice(0, colonIdx);
    const pass = decoded.slice(colonIdx + 1);
    if (user === siteUser && pass === sitePassword) return null;
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Pickleball Hub", charset="UTF-8"',
    },
  });
}

export async function middleware(request: NextRequest) {
  // Site-wide Basic Auth gate (runs before any other checks)
  const authResponse = basicAuthCheck(request);
  if (authResponse) return authResponse;

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
  matcher: [
    /*
     * Match all request paths except static assets and Next.js internals
     * to allow the browser to load the Basic Auth prompt's CSS/fonts.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
