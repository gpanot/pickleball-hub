import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import {
  normalizeSquadNickname,
  SQUAD_NICKNAME_MAX,
  SQUAD_NICKNAME_MIN,
  validateSquadNickname,
} from "@/lib/squad-nickname";

const COOLDOWN_DAYS = 30;

/** Derive a clean handle base from a display name (first name, lowercase, letters+digits only). */
function handleBase(displayName: string | null): string {
  if (!displayName) return "player";
  const first = displayName.trim().split(/\s+/)[0];
  const cleaned = first.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return cleaned.length >= SQUAD_NICKNAME_MIN ? cleaned : "player";
}

/** Find an available handle: base, base2, base3, ... (max 20 attempts). */
async function suggestHandle(base: string, ownNickname: string | null): Promise<string> {
  const attempt = base.slice(0, SQUAD_NICKNAME_MAX);
  if (
    ownNickname?.toLowerCase() === attempt ||
    !(await prisma.playerProfile.findFirst({
      where: { squadNickname: { equals: attempt, mode: "insensitive" } },
      select: { id: true },
    }))
  ) {
    return attempt;
  }
  for (let i = 2; i <= 20; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, SQUAD_NICKNAME_MAX - suffix.length) + suffix;
    if (
      ownNickname?.toLowerCase() === candidate ||
      !(await prisma.playerProfile.findFirst({
        where: { squadNickname: { equals: candidate, mode: "insensitive" } },
        select: { id: true },
      }))
    ) {
      return candidate;
    }
  }
  return `${base.slice(0, 14)}${Date.now().toString().slice(-4)}`;
}

/** GET /api/squads/nickname?q=handle — availability check + caller's current nickname + suggestion */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = normalizeSquadNickname(searchParams.get("q") ?? "");

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
    // If no current nickname, generate a suggestion from the user's first name
    const suggestion =
      me?.squadNickname ??
      (await suggestHandle(handleBase(me?.displayName ?? null), me?.squadNickname ?? null));

    return NextResponse.json({
      current: me?.squadNickname ?? null,
      suggestion,
      setAt: me?.squadNicknameSetAt?.toISOString() ?? null,
      displayName: me?.displayName ?? null,
      dupr: me?.reclubPlayer?.duprDoubles != null ? Number(me.reclubPlayer.duprDoubles) : null,
      imageUrl: me?.reclubPlayer?.imageUrl ?? null,
    });
  }

  const validationError = validateSquadNickname(q);
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
  const nickname = normalizeSquadNickname(raw);

  const validationError = validateSquadNickname(nickname);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const me = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { squadNickname: true, squadNicknameSetAt: true },
  });

  // Cooldown logic (disabled for now — kept for future re-activation)
  // if (
  //   me?.squadNicknameSetAt &&
  //   me.squadNickname?.toLowerCase() !== nickname
  // ) {
  //   const daysSince =
  //     (Date.now() - new Date(me.squadNicknameSetAt).getTime()) /
  //     (1000 * 60 * 60 * 24);
  //   if (daysSince < COOLDOWN_DAYS) {
  //     const daysLeft = Math.ceil(COOLDOWN_DAYS - daysSince);
  //     return NextResponse.json(
  //       { error: `Nickname locked — ${daysLeft} days until you can change it` },
  //       { status: 409 },
  //     );
  //   }
  // }

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
