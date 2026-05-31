import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signMobileJwt } from "@/lib/mobile-auth";
import * as jose from "jose";

const GOOGLE_TOKEN_INFO = "https://oauth2.googleapis.com/tokeninfo";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";
const DEV_EMAIL = "dev@thehub.local";

/**
 * GET /api/auth/mobile-token?dev=1
 * Dev-only shortcut: creates/retrieves a dev user and returns a real JWT
 * so the full onboarding + follow flow can be tested without Google.
 */
export async function GET(req: NextRequest) {
  const isDev = req.nextUrl.searchParams.get("dev");
  if (!isDev) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let user = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: DEV_EMAIL,
        name: "Dev Player",
        image: "https://i.pravatar.cc/80?img=33",
      },
    });
  }

  let profile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    profile = await prisma.playerProfile.create({
      data: { userId: user.id, displayName: user.name },
    });
  }

  const jwt = await signMobileJwt({ sub: user.id, profileId: profile.id });

  const prefs = (profile.preferences as Record<string, unknown>) ?? {};
  const rawDupr = prefs.dupr;
  const duprRating =
    typeof rawDupr === 'number' ? rawDupr :
    typeof rawDupr === 'string' && rawDupr !== '' ? parseFloat(rawDupr) || null :
    null;

  return NextResponse.json({
    jwt,
    userId: user.id,
    profileId: profile.id,
    displayName: user.name,
    imageUrl: user.image,
    reclubUserId: profile.reclubUserId
      ? profile.reclubUserId.toString()
      : null,
    hasCompletedOnboarding: profile.onboardingCompleted,
    duprRating,
    gender: profile.gender ?? null,
  });
}

/** Shared helper: find-or-create user + profile and return a JWT response. */
async function buildAuthResponse(params: {
  email: string | null | undefined;
  name: string | null | undefined;
  image: string | null | undefined;
  provider: string;
  providerAccountId: string;
  idToken: string;
  emailVerified?: boolean;
}) {
  const { email, name, image, provider, providerAccountId, idToken, emailVerified } = params;

  let user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.account
        .findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } } })
        .then((a) => (a ? prisma.user.findUnique({ where: { id: a.userId } }) : null));

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: email ?? null,
        name: name ?? null,
        image: image ?? null,
        emailVerified: emailVerified ? new Date() : null,
      },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider,
        providerAccountId,
        id_token: idToken,
      },
    });
  }

  let profile = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.playerProfile.create({
      data: { userId: user.id, displayName: user.name },
    });
  }

  const jwt = await signMobileJwt({ sub: user.id, profileId: profile.id });
  const prefs = (profile.preferences as Record<string, unknown>) ?? {};
  const rawDupr = prefs.dupr;
  const duprRating =
    typeof rawDupr === "number" ? rawDupr :
    typeof rawDupr === "string" && rawDupr !== "" ? parseFloat(rawDupr) || null :
    null;

  return NextResponse.json({
    jwt,
    userId: user.id,
    profileId: profile.id,
    displayName: user.name,
    imageUrl: user.image,
    reclubUserId: profile.reclubUserId ? profile.reclubUserId.toString() : null,
    hasCompletedOnboarding: profile.onboardingCompleted,
    duprRating,
    gender: profile.gender ?? null,
  });
}

/**
 * POST /api/auth/mobile-token
 * Body: { idToken: string, provider?: "google" | "apple" }
 *
 * Verifies a Google or Apple idToken, creates/retrieves the User + PlayerProfile,
 * and returns a lightweight JWT the mobile app uses for all subsequent calls.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { idToken?: string; provider?: string };
    const { idToken, provider = "google" } = body;

    if (!idToken) {
      return NextResponse.json({ error: "idToken required" }, { status: 400 });
    }

    // ── Apple Sign-In ─────────────────────────────────────────────────────────
    if (provider === "apple") {
      const JWKS = jose.createRemoteJWKSet(new URL(APPLE_KEYS_URL));
      const bundleId = process.env.APPLE_APP_BUNDLE_ID ?? "com.squadd.thehub.app";

      let payload: jose.JWTPayload;
      try {
        const { payload: p } = await jose.jwtVerify(idToken, JWKS, {
          issuer: APPLE_ISSUER,
          audience: bundleId,
        });
        payload = p;
      } catch (err) {
        console.error("[POST /api/auth/mobile-token] Apple token invalid", err);
        return NextResponse.json({ error: "Invalid Apple token" }, { status: 401 });
      }

      const sub = payload.sub as string;
      const email = payload.email as string | undefined;
      const emailVerified = payload.email_verified === true || payload.email_verified === "true";

      return buildAuthResponse({
        email,
        name: null,
        image: null,
        provider: "apple",
        providerAccountId: sub,
        idToken,
        emailVerified,
      });
    }

    // ── Google Sign-In ────────────────────────────────────────────────────────
    const res = await fetch(`${GOOGLE_TOKEN_INFO}?id_token=${idToken}`);
    if (!res.ok) {
      return NextResponse.json({ error: "Invalid Google token" }, { status: 401 });
    }

    const goog = (await res.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: string;
    };

    return buildAuthResponse({
      email: goog.email,
      name: goog.name,
      image: goog.picture,
      provider: "google",
      providerAccountId: goog.sub,
      idToken,
      emailVerified: goog.email_verified === "true",
    });
  } catch (err) {
    console.error("[POST /api/auth/mobile-token]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
