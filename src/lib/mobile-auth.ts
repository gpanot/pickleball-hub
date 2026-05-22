import { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/db";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ""
);

export interface MobileUser {
  userId: string;
  profileId: string;
  reclubUserId: bigint | null;
}

export async function signMobileJwt(payload: {
  sub: string;
  profileId: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(SECRET);
}

export async function getMobileUser(
  req: NextRequest
): Promise<MobileUser | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const { payload } = await jwtVerify(header.slice(7), SECRET);
    const userId = payload.sub as string | undefined;
    const profileId = payload.profileId as string | undefined;
    if (!userId || !profileId) return null;

    const profile = await prisma.playerProfile.findUnique({
      where: { id: profileId },
      select: { reclubUserId: true },
    });

    return {
      userId,
      profileId,
      reclubUserId: profile?.reclubUserId ?? null,
    };
  } catch {
    return null;
  }
}
