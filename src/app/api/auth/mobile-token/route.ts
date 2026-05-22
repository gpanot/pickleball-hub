import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signMobileJwt } from "@/lib/mobile-auth";

const GOOGLE_TOKEN_INFO = "https://oauth2.googleapis.com/tokeninfo";

/**
 * POST /api/auth/mobile-token
 * Body: { idToken: string }
 *
 * Verifies a Google idToken, creates/retrieves the User + PlayerProfile,
 * and returns a lightweight JWT the mobile app uses for all subsequent calls.
 */
export async function POST(req: NextRequest) {
  try {
    const { idToken } = (await req.json()) as { idToken?: string };
    if (!idToken) {
      return NextResponse.json({ error: "idToken required" }, { status: 400 });
    }

    const res = await fetch(`${GOOGLE_TOKEN_INFO}?id_token=${idToken}`);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Invalid Google token" },
        { status: 401 }
      );
    }

    const goog = (await res.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: string;
    };

    const expectedClientId =
      process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
    if (expectedClientId && goog.sub && !goog.email) {
      return NextResponse.json(
        { error: "Token missing email" },
        { status: 401 }
      );
    }

    // Find or create the User (same as NextAuth would)
    let user = goog.email
      ? await prisma.user.findUnique({ where: { email: goog.email } })
      : null;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: goog.email,
          name: goog.name ?? null,
          image: goog.picture ?? null,
          emailVerified: goog.email_verified === "true" ? new Date() : null,
        },
      });

      // Also create Account row so NextAuth recognises this user later
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: goog.sub,
          id_token: idToken,
        },
      });
    }

    // Ensure PlayerProfile exists
    let profile = await prisma.playerProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      profile = await prisma.playerProfile.create({
        data: { userId: user.id, displayName: user.name },
      });
    }

    const jwt = await signMobileJwt({
      sub: user.id,
      profileId: profile.id,
    });

    return NextResponse.json({
      jwt,
      userId: user.id,
      profileId: profile.id,
      displayName: user.name,
      imageUrl: user.image,
      reclubUserId: profile.reclubUserId
        ? profile.reclubUserId.toString()
        : null,
      hasCompletedOnboarding: Object.keys(
        (profile.preferences as Record<string, unknown>) ?? {}
      ).length > 0,
    });
  } catch (err) {
    console.error("[POST /api/auth/mobile-token]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
