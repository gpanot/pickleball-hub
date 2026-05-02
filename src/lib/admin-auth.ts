/**
 * Admin authentication helpers.
 * Uses HMAC-SHA256 via Web Crypto (Edge + Node compatible) — no NextAuth.
 */
import { cookies } from "next/headers";

const SESSION_COOKIE = "admin_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

async function hmacHex(key: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function expectedToken(): Promise<string> {
  const secret = process.env.ADMIN_SECRET ?? "";
  return hmacHex(secret, "admin:" + secret);
}

/** True if the current request carries a valid admin session cookie. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  if (!token) return false;
  return token === (await expectedToken());
}

/** Build a Set-Cookie string for a fresh admin session. */
export async function buildSessionCookie(): Promise<string> {
  const token = await expectedToken();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
}

/** Check the submitted password against ADMIN_SECRET. */
export async function checkPassword(password: string): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET ?? "";
  if (!secret) return false;
  // Constant-time comparison via double-HMAC
  const [a, b] = await Promise.all([
    hmacHex(secret, password),
    hmacHex(secret, secret),
  ]);
  return a === b;
}
