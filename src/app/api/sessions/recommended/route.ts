import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/utils";

type TimeSlot = "weekday_evenings" | "weekends" | "anytime";
type Level = "casual" | "intermediate" | "competitive";
type TravelTime = "10min" | "15min" | "any";

interface Preferences {
  timeSlots: TimeSlot;
  level: Level;
  travelTime: TravelTime;
}

function getRadiusKm(travelTime: string, hour: number): number | null {
  if (travelTime === "any") return null;
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  if (travelTime === "10min") return isRushHour ? 2 : 4;
  if (travelTime === "15min") return isRushHour ? 4 : 7;
  return null;
}

function parseHour(timeStr: string): number {
  return parseInt(timeStr.split(":")[0] ?? "0", 10);
}

function isWeekdayEvening(startTime: string, scrapedDate: string): boolean {
  const [y, m, d] = scrapedDate.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const dayOfWeek = date.getDay();
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const hour = parseHour(startTime);
  return isWeekday && hour >= 17;
}

function isWeekend(scrapedDate: string): boolean {
  const [y, m, d] = scrapedDate.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function timeMatchScore(startTime: string, scrapedDate: string, timeSlots: TimeSlot): number {
  if (timeSlots === "anytime") return 1;
  if (timeSlots === "weekday_evenings") return isWeekdayEvening(startTime, scrapedDate) ? 1 : 0;
  if (timeSlots === "weekends") return isWeekend(scrapedDate) ? 1 : 0;
  return 0;
}

function levelMatchScore(sessionName: string, level: Level): number {
  const lower = sessionName.toLowerCase();
  const isCompetitive =
    lower.includes("competitive") ||
    lower.includes("advanced") ||
    lower.includes("pro") ||
    lower.includes("tournament");
  const isCasual =
    lower.includes("casual") ||
    lower.includes("beginner") ||
    lower.includes("friendly") ||
    lower.includes("fun") ||
    lower.includes("social");

  if (level === "competitive") return isCompetitive ? 1 : isCasual ? 0 : 0.5;
  if (level === "casual") return isCasual ? 1 : isCompetitive ? 0 : 0.5;
  return 0.7;
}

function distanceScore(
  distKm: number | null,
  radiusKm: number | null,
): number {
  if (distKm === null) return 0.5;
  if (radiusKm === null) {
    return Math.max(0, 1 - distKm / 20);
  }
  if (distKm > radiusKm) return 0;
  return 1 - distKm / radiusKm;
}

function getMatchReasons(
  sessionName: string,
  startTime: string,
  scrapedDate: string,
  distKm: number | null,
  prefs: Preferences,
  spotsLeft: number,
): string[] {
  const reasons: string[] = [];

  if (prefs.timeSlots === "weekday_evenings" && isWeekdayEvening(startTime, scrapedDate)) {
    reasons.push("Matches your evening schedule");
  } else if (prefs.timeSlots === "weekends" && isWeekend(scrapedDate)) {
    reasons.push("Available on weekends");
  }

  const lower = sessionName.toLowerCase();
  if (prefs.level === "competitive" && (lower.includes("competitive") || lower.includes("advanced"))) {
    reasons.push("Competitive level");
  } else if (prefs.level === "casual" && (lower.includes("casual") || lower.includes("beginner") || lower.includes("social"))) {
    reasons.push("Casual & social");
  }

  if (distKm !== null && distKm < 10) {
    const mins = Math.round(distKm * 2.5);
    reasons.push(`${mins} min away`);
  }

  if (spotsLeft >= 3) {
    reasons.push(`${spotsLeft} spots left`);
  }

  return reasons.slice(0, 2);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const profileId = searchParams.get("profileId");
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    let prefs: Preferences | null = null;

    if (profileId) {
      const profile = await prisma.playerProfile.findUnique({ where: { id: profileId } });
      if (profile?.preferences && typeof profile.preferences === "object") {
        const p = profile.preferences as Record<string, unknown>;
        if (p.timeSlots && p.level && p.travelTime) {
          prefs = {
            timeSlots: p.timeSlots as TimeSlot,
            level: p.level as Level,
            travelTime: p.travelTime as TravelTime,
          };
        }
      }
    }

    if (!prefs) {
      const tsp = searchParams.get("timeSlots");
      const lp = searchParams.get("level");
      const ttp = searchParams.get("travelTime");
      if (tsp && lp && ttp) {
        prefs = {
          timeSlots: tsp as TimeSlot,
          level: lp as Level,
          travelTime: ttp as TravelTime,
        };
      }
    }

    if (!prefs) {
      return NextResponse.json({ sessions: [] });
    }

    const sessions = await prisma.session.findMany({
      where: { scrapedDate: date },
      include: {
        club: true,
        venue: true,
        snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        duprStat: true,
      },
      orderBy: { startTime: "asc" },
    });

    const vnHour = new Date(Date.now() + 7 * 3600_000).getUTCHours();
    const radiusKm = getRadiusKm(prefs.travelTime, vnHour);

    const userLat = !Number.isNaN(lat) ? lat : null;
    const userLng = !Number.isNaN(lng) ? lng : null;

    const scored = sessions
      .map((s) => {
        const snap = s.snapshots[0];
        const joined = snap?.joined ?? 0;
        const waitlisted = snap?.waitlisted ?? 0;
        const fillRate = s.maxPlayers > 0 ? joined / s.maxPlayers : 0;
        if (fillRate >= 1) return null;

        const distKm =
          userLat !== null &&
          userLng !== null &&
          s.venue?.latitude != null &&
          s.venue?.longitude != null
            ? haversineKm(userLat, userLng, s.venue.latitude, s.venue.longitude)
            : null;

        if (radiusKm !== null && distKm !== null && distKm > radiusKm) return null;

        const tMatch = timeMatchScore(s.startTime, s.scrapedDate, prefs!.timeSlots);
        const lMatch = levelMatchScore(s.name, prefs!.level);
        const dScore = distanceScore(distKm, radiusKm);
        const spotsLeft = Math.max(0, s.maxPlayers - joined);
        const availBonus = spotsLeft >= 3 ? 1 : 0;

        const score = tMatch * 40 + lMatch * 30 + dScore * 20 + availBonus * 10;

        const matchReasons = getMatchReasons(
          s.name,
          s.startTime,
          s.scrapedDate,
          distKm,
          prefs!,
          spotsLeft,
        );

        const duprParticipationPct =
          s.duprStat != null ? Number(s.duprStat.duprParticipationPct) : null;

        return {
          id: s.id,
          referenceCode: s.referenceCode,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMin: s.durationMin,
          maxPlayers: s.maxPlayers,
          feeAmount: s.feeAmount,
          costPerHour: s.costPerHour,
          status: s.status,
          perks: s.perks,
          eventUrl: s.eventUrl,
          skillLevelMin: s.skillLevelMin,
          skillLevelMax: s.skillLevelMax,
          joined,
          waitlisted,
          fillRate: Math.round(fillRate * 100) / 100,
          duprParticipationPct,
          club: s.club,
          venue: s.venue,
          matchReasons,
          _score: score,
        };
      })
      .filter(Boolean);

    scored.sort((a, b) => b!._score - a!._score);
    const top6 = scored.slice(0, 6).map((s) => {
      const { _score, ...rest } = s!;
      void _score;
      return rest;
    });

    return NextResponse.json({ sessions: top6 });
  } catch (err) {
    console.error("[GET /api/sessions/recommended]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
