import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { isClubManager } from "@/lib/club-auth";
import { prisma } from "@/lib/db";

const CLUB_SELECT = {
  id: true,
  name: true,
  icon: true,
  sportId: true,
  privacy: true,
  level: true,
  autoApproveNewMembers: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, displayName: true, squadNickname: true } },
  managers: {
    select: {
      id: true,
      role: true,
      addedAt: true,
      profile: { select: { id: true, displayName: true, squadNickname: true } },
    },
  },
  _count: { select: { members: true, sessions: true } },
} as const;

// GET /api/app-clubs/[id] — fetch a single club (public)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const club = await prisma.appClub.findUnique({ where: { id }, select: CLUB_SELECT });
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });
  return NextResponse.json({ club });
}

// PATCH /api/app-clubs/[id] — edit club fields
// Auth: AppClubManager check (creator or manager)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getMobileUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authorized = await isClubManager(id, user.profileId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, icon, sportId, privacy, level, autoApproveNewMembers } = body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
      return NextResponse.json({ error: "Club name must be 1–80 characters" }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (icon !== undefined) updates.icon = typeof icon === "string" ? icon : null;
  if (sportId !== undefined) updates.sportId = typeof sportId === "number" ? sportId : null;
  if (privacy !== undefined && (privacy === "public" || privacy === "private")) updates.privacy = privacy;
  if (level !== undefined) updates.level = typeof level === "string" ? level : null;
  if (autoApproveNewMembers !== undefined) updates.autoApproveNewMembers = autoApproveNewMembers !== false;

  try {
    const club = await prisma.appClub.update({
      where: { id },
      data: updates,
      select: CLUB_SELECT,
    });
    return NextResponse.json({ ok: true, club });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") return NextResponse.json({ error: "Club not found" }, { status: 404 });
    console.error("[PATCH /api/app-clubs/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
