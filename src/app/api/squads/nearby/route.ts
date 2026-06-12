import { NextRequest, NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/squad-geo";
import { MAX_SQUAD_MEMBERS } from "@/lib/squad-constants";

/** GET /api/squads/nearby?lat=&lng=&radiusKm=10 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  let radiusKm = parseFloat(searchParams.get("radiusKm") ?? "10");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = 10;
  if (radiusKm > 100) radiusKm = 100;

  const squads = await prisma.squad.findMany({
    where: {
      disbandedAt: null,
      isPublic: true,
      appSlug: "squadd",
      latitude: { not: null },
      longitude: { not: null },
    },
    include: {
      code: { select: { code: true } },
      founder: {
        select: { displayName: true, squadNickname: true },
      },
      members: {
        where: { leftAt: null },
        include: {
          profile: {
            select: {
              displayName: true,
              squadNickname: true,
              reclubPlayer: { select: { duprDoubles: true } },
            },
          },
        },
      },
    },
  });

  const enriched = squads
    .map((squad) => {
      const squadLat = squad.latitude!;
      const squadLng = squad.longitude!;
      const distance = haversineKm(lat, lng, squadLat, squadLng);
      if (distance > radiusKm) return null;

      const memberCount = squad.members.length;
      const duprValues = squad.members
        .map((m) => m.profile?.reclubPlayer?.duprDoubles)
        .filter((v) => v != null)
        .map((v) => Number(v))
        .filter((v) => v > 0);
      const avgDupr =
        duprValues.length > 0
          ? duprValues.reduce((a, b) => a + b, 0) / duprValues.length
          : null;

      const founderName = squad.founder?.squadNickname
        ? `@${squad.founder.squadNickname}`
        : squad.founder?.displayName ?? null;

      return {
        id: squad.id,
        name: squad.name,
        emoji: squad.emoji,
        color: squad.color,
        memberCount,
        maxMembers: MAX_SQUAD_MEMBERS,
        openSpots: Math.max(0, MAX_SQUAD_MEMBERS - memberCount),
        avgDupr: avgDupr != null ? Math.round(avgDupr * 10) / 10 : null,
        level: squad.level,
        totalXp: squad.totalXp,
        sessions: Math.max(memberCount, Math.floor(squad.totalXp / 500)),
        distance: Math.round(distance * 10) / 10,
        members: squad.members.slice(0, 8).map((m) => {
          const label =
            m.profile?.squadNickname ?? m.profile?.displayName ?? "?";
          return {
            initial: label.charAt(0).toUpperCase(),
            displayName: m.profile?.displayName ?? null,
          };
        }),
        founderId: squad.founderId,
        founderName,
        code: squad.code?.code ?? null,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s != null)
    .sort((a, b) => a.distance - b.distance);

  return NextResponse.json({ squads: enriched });
}
