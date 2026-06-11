import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

const NICKNAME_MIN = 3;
const NICKNAME_MAX = 20;
const NICKNAME_RE = /^[a-zA-Z0-9_]+$/;
const COOLDOWN_DAYS = 30;

function validateNickname(raw: string): string | null {
  const n = raw.trim().toLowerCase();
  if (n.length < NICKNAME_MIN) return `At least ${NICKNAME_MIN} characters`;
  if (n.length > NICKNAME_MAX) return `Max ${NICKNAME_MAX} characters`;
  if (!NICKNAME_RE.test(n)) return "Letters, numbers and underscores only";
  return null; // ok
}

/** GET /api/squads/nickname?q=handle — availability check + caller's current nickname */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const me = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: {
      squadNickname: true,
      squadNicknameSetAt: true,
      displayName: true,
      reclubUserId: true,
      reclubPlayer: {
        select: { duprDoubles: true, imageUrl: true },
      },
    },
  });

  if (!q) {
    return NextResponse.json({
      current: me?.squadNickname ?? null,
      setAt: me?.squadNicknameSetAt?.toISOString() ?? null,
      displayName: me?.displayName ?? null,
      dupr: me?.reclubPlayer?.duprDoubles != null ? Number(me.reclubPlayer.duprDoubles) : null,
      imageUrl: me?.reclubPlayer?.imageUrl ?? null,
    });
  }

  const validationError = validateNickname(q);
  if (validationError) {
    return NextResponse.json({ available: false, reason: validationError });
  }

  // Own handle is always "available" (re-confirming same nickname is fine)
  if (me?.squadNickname?.toLowerCase() === q) {
    return NextResponse.json({ available: true, taken: false });
  }

  const taken = await prisma.playerProfile.findFirst({
    where: { squadNickname: { equals: q, mode: "insensitive" } },
    select: { id: true },
  });

  return NextResponse.json({ available: !taken, taken: !!taken });
}

/** POST /api/squads/nickname — save the nickname */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { nickname?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.nickname ?? "";
  const nickname = raw.trim().toLowerCase();

  const validationError = validateNickname(nickname);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const me = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { squadNickname: true, squadNicknameSetAt: true },
  });

  // Cooldown — cannot change if set within 30 days, unless it's the same handle
  if (
    me?.squadNicknameSetAt &&
    me.squadNickname?.toLowerCase() !== nickname
  ) {
    const daysSince =
      (Date.now() - new Date(me.squadNicknameSetAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSince < COOLDOWN_DAYS) {
      const daysLeft = Math.ceil(COOLDOWN_DAYS - daysSince);
      return NextResponse.json(
        { error: `Nickname locked — ${daysLeft} days until you can change it` },
        { status: 409 },
      );
    }
  }

  try {
    await prisma.playerProfile.update({
      where: { id: user.profileId },
      data: {
        squadNickname: nickname,
        squadNicknameSetAt: new Date(),
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Nickname already taken" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, nickname });
}
