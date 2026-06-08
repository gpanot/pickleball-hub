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
  const prefsDuprDev =
    typeof rawDupr === 'number' ? rawDupr :
    typeof rawDupr === 'string' && rawDupr !== '' ? parseFloat(rawDupr) || null :
    null;

  let reclubDuprDev: number | null = null;
  if (profile.reclubUserId) {
    const player = await prisma.player.findUnique({
      where: { userId: profile.reclubUserId },
      select: { duprDoubles: true },
    });
    reclubDuprDev = player?.duprDoubles != null ? Number(player.duprDoubles) : null;
  }
  const duprRating = reclubDuprDev ?? prefsDuprDev;

  console.log(
    `[DUPR_DEBUG] mobile-token (dev): profileId=${profile.id} preferences.dupr=${prefsDuprDev} reclubDupr=${reclubDuprDev} final=${duprRating}`
  );

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

/**
 * Find-or-create a User + Account + PlayerProfile and return a signed JWT response.
 *
 * Identity strategy (by priority):
 *  1. Always look up by provider + providerAccountId first — this is the stable
 *     identifier that never changes and never depends on the user sharing their email.
 *  2. If not found by account, fall back to email lookup (handles the case where
 *     the same person previously signed in with Google using the same email).
 *  3. If still not found, create a new User (email may be null — Apple allows it).
 *
 * This makes Apple Sign-In work correctly whether the user hides their email or not,
 * on the first sign-in and on every subsequent sign-in.
 */
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

  // Step 1: look up by stable provider account ID
  const existingAccount = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: true },
  });

  let user = existingAccount?.user ?? null;

  // Step 2: if no account record yet, try to match an existing user by email
  // (so a Google user who also sets up Apple uses the same profile)
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } }) ?? null;
  }

  // Step 3: create new user if still not found
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: email ?? null,
        name: name ?? null,
        image: image ?? null,
        emailVerified: emailVerified ? new Date() : null,
      },
    });
  } else {
    // Update name/image if we now have them (Apple only sends on first sign-in)
    const updates: Record<string, unknown> = {};
    if (name && !user.name) updates.name = name;
    if (image && !user.image) updates.image = image;
    if (email && !user.email) {
      updates.email = email;
      if (emailVerified) updates.emailVerified = new Date();
    }
    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    }
  }

  // Step 4: ensure the Account record exists (idempotent upsert)
  if (!existingAccount) {
    await prisma.account.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      create: {
        userId: user.id,
        type: "oauth",
        provider,
        providerAccountId,
        id_token: idToken,
      },
      update: { id_token: idToken },
    });
  }

  // Step 5: ensure PlayerProfile exists
  let profile = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.playerProfile.create({
      data: { userId: user.id, displayName: user.name },
    });
  }

  const jwt = await signMobileJwt({ sub: user.id, profileId: profile.id });
  const prefs = (profile.preferences as Record<string, unknown>) ?? {};
  const rawDupr = prefs.dupr;
  const prefsDupr =
    typeof rawDupr === "number" ? rawDupr :
    typeof rawDupr === "string" && rawDupr !== "" ? parseFloat(rawDupr) || null :
    null;

  let reclubDupr: number | null = null;
  if (profile.reclubUserId) {
    const player = await prisma.player.findUnique({
      where: { userId: profile.reclubUserId },
      select: { duprDoubles: true },
    });
    reclubDupr = player?.duprDoubles != null ? Number(player.duprDoubles) : null;
  }
  const duprRating = reclubDupr ?? prefsDupr;

  console.log(
    `[DUPR_DEBUG] mobile-token: profileId=${profile.id} reclubUserId=${profile.reclubUserId ?? "none"} preferences.dupr=${prefsDupr} reclubDupr=${reclubDupr} final=${duprRating}`
  );

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
 * Body: { idToken: string, provider?: "google" | "apple", givenName?, familyName?, credentialEmail? }
 *
 * Verifies a Google or Apple idToken, creates/retrieves the User + PlayerProfile,
 * and returns a lightweight JWT the mobile app uses for all subsequent calls.
 *
 * Apple compliance:
 * - Email is optional. Users may hide their email (Apple private relay) — we never
 *   require it. Identity is established via the stable `sub` (Apple user ID).
 * - `givenName` / `familyName` are only provided by the credential on the very first
 *   sign-in; the client forwards them here and we store them if the user has no name yet.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      idToken?: string;
      provider?: string;
      givenName?: string | null;
      familyName?: string | null;
      credentialEmail?: string | null;
    };
    const { idToken, provider = "google", givenName, familyName, credentialEmail } = body;
    const ua = req.headers.get("user-agent") ?? "<unknown>";
    const xff = req.headers.get("x-forwarded-for") ?? "<unknown>";
    console.log("[POST /api/auth/mobile-token] incoming", {
      provider,
      hasIdToken: Boolean(idToken),
      idTokenLength: idToken?.length ?? 0,
      userAgent: ua,
      forwardedFor: xff,
    });

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
      // Email may be absent (user chose to hide it) — that is fine and expected.
      // Prefer the JWT claim; fall back to the credential email forwarded by the client.
      const jwtEmail = payload.email as string | undefined;
      const email = jwtEmail || credentialEmail || null;
      const emailVerified = payload.email_verified === true || payload.email_verified === "true";

      // Build a display name from the credential's fullName (only available on first sign-in).
      const parts = [givenName, familyName].filter(Boolean);
      const name = parts.length > 0 ? parts.join(" ") : null;

      console.log("[POST /api/auth/mobile-token] apple sub", {
        sub: sub ? `${sub.slice(0, 8)}...` : "<missing>",
        hasEmail: Boolean(email),
        hasName: Boolean(name),
      });

      return buildAuthResponse({
        email,
        name,
        image: null,
        provider: "apple",
        providerAccountId: sub,
        idToken,
        emailVerified,
      });
    }

    // ── Google Sign-In ────────────────────────────────────────────────────────
    const res = await fetch(`${GOOGLE_TOKEN_INFO}?id_token=${idToken}`);
    console.log("[POST /api/auth/mobile-token] google tokeninfo status", {
      status: res.status,
      ok: res.ok,
    });
    if (!res.ok) {
      const tokenInfoBody = await res.text().catch(() => "<unreadable>");
      console.warn("[POST /api/auth/mobile-token] Invalid Google token", {
        status: res.status,
        body: tokenInfoBody,
      });
      return NextResponse.json({ error: "Invalid Google token" }, { status: 401 });
    }

    const goog = (await res.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: string;
      aud?: string;
      azp?: string;
      iss?: string;
    };
    console.log("[POST /api/auth/mobile-token] google tokeninfo payload", {
      sub: goog.sub ? `${goog.sub.slice(0, 6)}...` : "<missing>",
      email: goog.email ?? null,
      aud: goog.aud ?? null,
      azp: goog.azp ?? null,
      iss: goog.iss ?? null,
      email_verified: goog.email_verified ?? null,
    });

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
