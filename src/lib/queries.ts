import { prisma } from "./db";
import { computeHcmMedianCostPerHour, computeSessionScore } from "./scoring";
import { parseSessionType, vnCalendarDateString } from "./utils";

const MAX_DURATION_MIN = 360;

export interface SessionFilters {
  date?: string;
  timeSlot?: "morning" | "afternoon" | "evening";
  minSkill?: number;
  maxPrice?: number;
  freeOnly?: boolean;
  availability?: "available" | "filling" | "full";
  clubSlug?: string;
  venueId?: number;
  hasPerks?: boolean;
  search?: string;
}

/** Est. revenue rank for a calendar day (1 = highest revenue), tie-break by club name. */
async function getClubRevenueRanksForDate(date: string): Promise<Map<number, number>> {
  const stats = await prisma.clubDailyStat.findMany({
    where: { date },
    include: { club: { select: { id: true, name: true } } },
  });
  stats.sort((a, b) => {
    const rev = b.revenueEstimate - a.revenueEstimate;
    if (rev !== 0) return rev;
    return (a.club?.name ?? "").localeCompare(b.club?.name ?? "");
  });
  const rankByClubId = new Map<number, number>();
  stats.forEach((row, index) => {
    rankByClubId.set(row.clubId, index + 1);
  });
  return rankByClubId;
}

export async function getScoringContextForDate(date: string): Promise<{
  hcmMedianCostPerHour: number;
  rankByClubId: Map<number, number>;
}> {
  const rankByClubId = await getClubRevenueRanksForDate(date);
  const slim = await prisma.session.findMany({
    where: { scrapedDate: date },
    select: { feeAmount: true, durationMin: true, clubId: true },
  });
  const hcmMedianCostPerHour = computeHcmMedianCostPerHour(
    slim.map((s) => ({
      feeAmount: s.feeAmount,
      durationMinutes: s.durationMin,
      clubRank: rankByClubId.get(s.clubId),
    })),
  );

  try {
    await prisma.hcmMarketMedianDaily.upsert({
      where: { date },
      create: { date, medianCostPerHour: hcmMedianCostPerHour },
      update: { medianCostPerHour: hcmMedianCostPerHour },
    });
  } catch (e) {
    console.error("[getScoringContextForDate] hcm_market_median_daily upsert failed:", e);
  }

  return { hcmMedianCostPerHour, rankByClubId };
}

/** Last N calendar days of stored HCM median cost/hour (oldest first, for charts). */
export async function getMarketMedianCostPerHourSeries(days: number) {
  const take = Math.min(Math.max(1, Math.floor(days)), 730);
  try {
    const rows = await prisma.hcmMarketMedianDaily.findMany({
      orderBy: { date: "desc" },
      take,
      select: { date: true, medianCostPerHour: true },
    });
    return [...rows].reverse();
  } catch (e) {
    console.error("[getMarketMedianCostPerHourSeries]", e);
    return [];
  }
}

export async function getHcmMedianCostPerHourForDate(date: string): Promise<number> {
  const { hcmMedianCostPerHour } = await getScoringContextForDate(date);
  return hcmMedianCostPerHour;
}

export async function getSessions(filters: SessionFilters = {}) {
  const date = filters.date || vnCalendarDateString(0);
  const { hcmMedianCostPerHour, rankByClubId } = await getScoringContextForDate(date);

  const where: Record<string, unknown> = {
    scrapedDate: date,
  };

  if (filters.clubSlug) {
    where.club = { slug: filters.clubSlug };
  }

  if (filters.venueId) {
    where.venueId = filters.venueId;
  }

  if (filters.timeSlot) {
    const ranges: Record<string, [string, string]> = {
      morning: ["00:00", "11:59"],
      afternoon: ["12:00", "16:59"],
      evening: ["17:00", "23:59"],
    };
    const [min, max] = ranges[filters.timeSlot];
    where.startTime = { gte: min, lte: max };
  }

  if (filters.minSkill) {
    where.OR = [
      { skillLevelMin: { lte: filters.minSkill }, skillLevelMax: { gte: filters.minSkill } },
      { skillLevelMin: { lte: filters.minSkill }, skillLevelMax: null },
      { skillLevelMin: null },
    ];
  }

  if (filters.freeOnly) {
    where.feeAmount = 0;
  } else if (filters.maxPrice) {
    where.feeAmount = { lte: filters.maxPrice };
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    const searchCondition = {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { club: { name: { contains: q, mode: "insensitive" as const } } },
        { venue: { name: { contains: q, mode: "insensitive" as const } } },
        { venue: { address: { contains: q, mode: "insensitive" as const } } },
      ],
    };

    const priorAnd: object[] = Array.isArray(where.AND)
      ? [...(where.AND as object[])]
      : where.AND
        ? [where.AND as object]
        : [];

    if (where.OR) {
      priorAnd.push({ OR: where.OR as object[] });
      delete where.OR;
    }

    priorAnd.push(searchCondition);
    where.AND = priorAnd;
  }

  const sessions = await prisma.session.findMany({
    where,
    include: {
      club: true,
      venue: true,
      snapshots: {
        orderBy: { scrapedAt: "desc" },
        take: 1,
      },
      duprStat: true,
    },
    orderBy: { startTime: "asc" },
  });

  const mapped = sessions.map((s) => {
    const snap = s.snapshots[0];
    const joined = snap?.joined ?? 0;
    const waitlisted = snap?.waitlisted ?? 0;
    const fillRate = s.maxPlayers > 0 ? joined / s.maxPlayers : 0;
    const { duprStat, club, ...sessionRest } = s;
    const duprParticipationPct =
      duprStat != null ? Number(duprStat.duprParticipationPct) : null;
    const returningPlayerPct =
      duprStat?.returningPlayerPct != null ? Number(duprStat.returningPlayerPct) : null;
    const clubRank = rankByClubId.get(s.clubId);

    return {
      ...sessionRest,
      club: { ...club, clubRank },
      joined,
      waitlisted,
      fillRate: Math.round(fillRate * 100) / 100,
      duprParticipationPct,
      returningPlayerPct,
    };
  });

  return { sessions: mapped, hcmMedianCostPerHour };
}

export type GetSessionsListItem = Awaited<ReturnType<typeof getSessions>>["sessions"][number];

export async function getSessionsLastScrapedAt(date?: string) {
  const targetDate = date || vnCalendarDateString(0);
  const result = await prisma.dailySnapshot.findFirst({
    where: { session: { scrapedDate: targetDate } },
    orderBy: { scrapedAt: "desc" },
    select: { scrapedAt: true },
  });
  return result?.scrapedAt ?? null;
}

/** Latest row for a Reclub meet reference (by most recent scrape day). */
export async function getSessionByReferenceCode(referenceCode: string) {
  const session = await prisma.session.findFirst({
    where: { referenceCode },
    orderBy: { scrapedDate: "desc" },
    include: {
      club: true,
      venue: true,
      duprStat: true,
      snapshots: {
        orderBy: { scrapedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!session) return null;

  const { hcmMedianCostPerHour, rankByClubId } = await getScoringContextForDate(session.scrapedDate);
  const snap = session.snapshots[0];
  const joined = snap?.joined ?? 0;
  const waitlisted = snap?.waitlisted ?? 0;
  const fillRate = session.maxPlayers > 0 ? joined / session.maxPlayers : 0;
  const duprParticipationPct =
    session.duprStat != null ? Number(session.duprStat.duprParticipationPct) : null;
  const returningPlayerPct =
    session.duprStat?.returningPlayerPct != null ? Number(session.duprStat.returningPlayerPct) : null;
  const { duprStat, club, ...sessionRest } = session;
  const clubRank = rankByClubId.get(session.clubId);

  const mapped = {
    ...sessionRest,
    club: { ...club, clubRank },
    joined,
    waitlisted,
    fillRate: Math.round(fillRate * 100) / 100,
    duprParticipationPct,
    returningPlayerPct,
  };

  return { session: mapped, hcmMedianCostPerHour };
}

export type PublicSessionByReference = NonNullable<
  Awaited<ReturnType<typeof getSessionByReferenceCode>>
>["session"];

export async function getClubs() {
  const todayStr = vnCalendarDateString(0);

  const hcmMedianCostPerHour = await getHcmMedianCostPerHourForDate(todayStr);

  const todaySessionsForScores = await prisma.session.findMany({
    where: { scrapedDate: todayStr },
    select: {
      clubId: true,
      name: true,
      maxPlayers: true,
      feeAmount: true,
      durationMin: true,
      club: { select: { zaloUrl: true } },
      snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
    },
  });

  const scoresByClub = new Map<number, number[]>();
  for (const s of todaySessionsForScores) {
    const joined = s.snapshots[0]?.joined ?? 0;
    const { score } = computeSessionScore({
      confirmedPlayers: joined,
      capacity: s.maxPlayers,
      priceVnd: s.feeAmount,
      durationMinutes: s.durationMin,
      hasZalo: Boolean(s.club.zaloUrl),
      hcmMedianCostPerHour,
      sessionType: parseSessionType(s.name),
    });
    const list = scoresByClub.get(s.clubId);
    if (list) list.push(score);
    else scoresByClub.set(s.clubId, [score]);
  }

  const clubs = await prisma.club.findMany({
    include: {
      _count: { select: { sessions: true } },
      dailyStats: {
        orderBy: { date: "desc" },
        take: 7,
      },
      sessions: {
        select: {
          venue: { select: { latitude: true, longitude: true } },
        },
        where: { venue: { isNot: null } },
        take: 1,
      },
    },
    orderBy: { numMembers: "desc" },
  });

  return clubs.map((c) => {
    const recentStats = c.dailyStats;
    const avgFillRate =
      recentStats.length > 0
        ? recentStats.reduce((sum, s) => sum + s.avgFillRate, 0) / recentStats.length
        : 0;
    const avgFee =
      recentStats.length > 0
        ? recentStats.reduce((sum, s) => sum + s.avgFee, 0) / recentStats.length
        : 0;
    const totalSessionsWeek = recentStats.reduce((sum, s) => sum + s.totalSessions, 0);

    const todayStat = recentStats.find((s) => s.date === todayStr);
    const totalJoined = todayStat?.totalJoined ?? 0;
    const totalCapacity = todayStat?.totalCapacity ?? 0;

    const venueCoords = c.sessions[0]?.venue;

    const avgFeeRounded = Math.round(avgFee);

    const clubScores = scoresByClub.get(c.id) ?? [];
    const avgSessionScore =
      clubScores.length > 0
        ? Math.round(clubScores.reduce((a, b) => a + b, 0) / clubScores.length)
        : null;

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      numMembers: c.numMembers,
      reclubId: c.reclubId,
      zaloUrl: c.zaloUrl,
      phone: c.phone,
      admins: c.admins,
      avgFillRate: Math.round(avgFillRate * 100) / 100,
      avgFee: avgFeeRounded,
      avgFeeToday: todayStat ? Math.round(todayStat.avgFee) : avgFeeRounded,
      totalSessionsWeek,
      sessionsToday: todayStat?.totalSessions ?? 0,
      totalJoined,
      totalCapacity,
      revenueEstimate: Math.round(todayStat?.revenueEstimate ?? 0),
      latitude: venueCoords?.latitude ?? null,
      longitude: venueCoords?.longitude ?? null,
      avgSessionScore,
    };
  });
}

export type GetClubsListItem = Awaited<ReturnType<typeof getClubs>>[number];

export async function getClubsLastUpdatedAt() {
  const result = await prisma.club.aggregate({
    _max: { updatedAt: true },
  });
  return result._max.updatedAt;
}

export async function getClubBySlug(slug: string) {
  const club = await prisma.club.findUnique({
    where: { slug },
    include: {
      sessions: {
        orderBy: { startTime: "asc" },
        include: {
          venue: true,
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
          duprStat: true,
        },
      },
      dailyStats: {
        orderBy: { date: "desc" },
        take: 30,
      },
    },
  });

  if (!club) return null;

  const hcmMedianCostPerHour = await getHcmMedianCostPerHourForDate(vnCalendarDateString(0));

  return {
    ...club,
    hcmMedianCostPerHour,
    sessions: club.sessions.map(({ duprStat, ...session }) => ({
      ...session,
      duprParticipationPct:
        duprStat != null ? Number(duprStat.duprParticipationPct) : null,
      returningPlayerPct:
        duprStat?.returningPlayerPct != null ? Number(duprStat.returningPlayerPct) : null,
    })),
  };
}

async function buildVenueNameMap() {
  const all = await prisma.venue.findMany({ select: { id: true, name: true, address: true } });
  const nameToGroup = new Map<string, { ids: number[]; canonicalId: number; address: string }>();
  for (const v of all) {
    const key = v.name.trim().toLowerCase();
    const existing = nameToGroup.get(key);
    if (existing) {
      existing.ids.push(v.id);
    } else {
      nameToGroup.set(key, { ids: [v.id], canonicalId: v.id, address: v.address });
    }
  }
  return nameToGroup;
}

export async function resolveVenueSiblingIds(venueId: number): Promise<number[]> {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } });
  if (!venue) return [venueId];
  const siblings = await prisma.venue.findMany({
    where: { name: { equals: venue.name, mode: "insensitive" } },
    select: { id: true },
  });
  return siblings.map((v) => v.id);
}

export async function getVenues() {
  const today = vnCalendarDateString(0);
  const nameMap = await buildVenueNameMap();

  const allVenues = await prisma.venue.findMany({
    include: {
      _count: { select: { sessions: true } },
      sessions: {
        where: { scrapedDate: today },
        include: {
          club: true,
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const venueById = new Map(allVenues.map((v) => [v.id, v]));
  const results: ReturnType<typeof computeVenueStats>[] = [];

  for (const [, group] of nameMap) {
    const groupVenues = group.ids.map((id) => venueById.get(id)).filter(Boolean) as typeof allVenues;
    if (groupVenues.length === 0) continue;

    const canonical = groupVenues[0];
    const totalAllTime = groupVenues.reduce((s, v) => s + v._count.sessions, 0);

    const seen = new Set<string>();
    const dedupedSessions = [];
    for (const v of groupVenues) {
      for (const s of v.sessions) {
        const key = `${s.referenceCode}:${s.scrapedDate}`;
        if (!seen.has(key)) {
          seen.add(key);
          dedupedSessions.push(s);
        }
      }
    }

    results.push(computeVenueStats(canonical, dedupedSessions, totalAllTime));
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

function computeVenueStats(
  canonical: { id: number; name: string; address: string; latitude: number; longitude: number; createdAt: Date; updatedAt: Date },
  todaySessions: { feeAmount: number; maxPlayers: number; startTime: string; endTime: string; club: { slug: string }; snapshots: { joined: number }[] }[],
  totalAllTime: number,
) {
  const totalJoined = todaySessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0), 0);
  const totalCapacity = todaySessions.reduce((s, x) => s + x.maxPlayers, 0);
  const avgFee = todaySessions.length > 0
    ? todaySessions.reduce((s, x) => s + x.feeAmount, 0) / todaySessions.length
    : 0;
  const fillRate = totalCapacity > 0 ? totalJoined / totalCapacity : 0;
  const revenueEstimate = todaySessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0) * x.feeAmount, 0);
  const uniqueClubs = new Set(todaySessions.map((s) => s.club.slug)).size;

  const hourlyActive = new Set<number>();
  for (const s of todaySessions) {
    const startH = parseInt(s.startTime.split(":")[0]);
    const endH = parseInt(s.endTime.split(":")[0]) || 24;
    for (let h = startH; h < endH; h++) hourlyActive.add(h);
  }

  return {
    id: canonical.id,
    name: canonical.name,
    address: canonical.address,
    latitude: canonical.latitude,
    longitude: canonical.longitude,
    createdAt: canonical.createdAt,
    updatedAt: canonical.updatedAt,
    _count: { sessions: totalAllTime },
    sessionsToday: todaySessions.length,
    totalJoined,
    totalCapacity,
    fillRate: Math.round(fillRate * 100) / 100,
    avgFee: Math.round(avgFee),
    revenueEstimate,
    uniqueClubs,
    activeHours: hourlyActive.size,
  };
}

export async function getVenueById(id: number) {
  return prisma.venue.findUnique({
    where: { id },
    include: {
      sessions: {
        orderBy: { startTime: "asc" },
        include: {
          club: true,
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
  });
}

export async function verifyAccessCode(code: string) {
  const ac = await prisma.accessCode.findUnique({
    where: { code },
    include: { club: true, venue: true },
  });

  if (!ac) return null;
  if (ac.expiresAt && ac.expiresAt < new Date()) return null;

  return ac;
}

export async function getOrganizerAnalytics(clubId: number) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      dailyStats: { orderBy: { date: "desc" }, take: 30 },
      sessions: {
        where: { scrapedDate: vnCalendarDateString(0), durationMin: { lte: MAX_DURATION_MIN } },
        include: {
          venue: true,
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
        orderBy: { startTime: "asc" },
      },
    },
  });

  if (!club) return null;

  const todaySessions = club.sessions.map((s) => {
    const snap = s.snapshots[0];
    return { ...s, joined: snap?.joined ?? 0, waitlisted: snap?.waitlisted ?? 0 };
  });

  const today = vnCalendarDateString(0);
  const competitors = await prisma.session.findMany({
    where: {
      scrapedDate: today,
      clubId: { not: clubId },
      durationMin: { lte: MAX_DURATION_MIN },
    },
    include: {
      club: true,
      venue: true,
      snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
    },
  });

  const competitorsByTime: Record<string, typeof competitors> = {};
  for (const s of competitors) {
    const hour = s.startTime.split(":")[0];
    const slot = parseInt(hour) < 12 ? "morning" : parseInt(hour) < 17 ? "afternoon" : "evening";
    if (!competitorsByTime[slot]) competitorsByTime[slot] = [];
    competitorsByTime[slot].push(s);
  }

  return {
    club,
    todaySessions,
    dailyStats: club.dailyStats,
    competitors: competitorsByTime,
    totalCompetitors: competitors.length,
  };
}

export async function getClubComparison(clubIds: number[]) {
  const today = vnCalendarDateString(0);

  const clubs = await prisma.club.findMany({
    where: { id: { in: clubIds } },
    include: {
      dailyStats: { orderBy: { date: "desc" }, take: 7 },
      sessions: {
        where: { scrapedDate: today },
        include: { snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 } },
      },
    },
  });

  return clubs.map((c) => {
    const todaySessions = c.sessions;
    const totalJoined = todaySessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0), 0);
    const totalCapacity = todaySessions.reduce((s, x) => s + x.maxPlayers, 0);
    const avgFee = todaySessions.length > 0
      ? todaySessions.reduce((s, x) => s + x.feeAmount, 0) / todaySessions.length
      : 0;
    const fillRate = totalCapacity > 0 ? totalJoined / totalCapacity : 0;
    const revenue = todaySessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0) * x.feeAmount, 0);

    const weeklyStats = c.dailyStats;
    const avgFillRateWeek = weeklyStats.length > 0
      ? weeklyStats.reduce((s, d) => s + d.avgFillRate, 0) / weeklyStats.length
      : 0;
    const totalSessionsWeek = weeklyStats.reduce((s, d) => s + d.totalSessions, 0);

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      numMembers: c.numMembers,
      sessionsToday: todaySessions.length,
      totalSessionsWeek,
      totalJoined,
      totalCapacity,
      fillRate: Math.round(fillRate * 100) / 100,
      avgFillRateWeek: Math.round(avgFillRateWeek * 100) / 100,
      avgFee: Math.round(avgFee),
      revenueEstimate: revenue,
    };
  });
}

export async function getOrganizerStats(clubId: number) {
  const sessions = await prisma.session.findMany({
    where: { clubId, durationMin: { lte: MAX_DURATION_MIN } },
    select: {
      scrapedDate: true,
      startTime: true,
      maxPlayers: true,
      feeAmount: true,
      snapshots: {
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: { joined: true },
      },
    },
    orderBy: { scrapedDate: "desc" },
  });

  return sessions.map((s) => ({
    scrapedDate: s.scrapedDate,
    startTime: s.startTime,
    maxPlayers: s.maxPlayers,
    feeAmount: s.feeAmount,
    joined: s.snapshots[0]?.joined ?? 0,
  }));
}

export async function getAllClubsStats() {
  const sessions = await prisma.session.findMany({
    where: { durationMin: { lte: MAX_DURATION_MIN } },
    select: {
      scrapedDate: true,
      startTime: true,
      maxPlayers: true,
      feeAmount: true,
      snapshots: {
        orderBy: { scrapedAt: "desc" },
        take: 1,
        select: { joined: true },
      },
    },
    orderBy: { scrapedDate: "desc" },
  });

  return sessions.map((s) => ({
    scrapedDate: s.scrapedDate,
    startTime: s.startTime,
    maxPlayers: s.maxPlayers,
    feeAmount: s.feeAmount,
    joined: s.snapshots[0]?.joined ?? 0,
  }));
}

export async function getVenueComparison(venueIds: number[]) {
  const today = vnCalendarDateString(0);

  const allSiblingIds = await Promise.all(venueIds.map((id) => resolveVenueSiblingIds(id)));
  const expandedIds = [...new Set(allSiblingIds.flat())];

  const venues = await prisma.venue.findMany({
    where: { id: { in: expandedIds } },
    include: {
      sessions: {
        where: { scrapedDate: today },
        include: {
          club: true,
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const venueById = new Map(venues.map((v) => [v.id, v]));
  const results = [];

  for (let i = 0; i < venueIds.length; i++) {
    const canonicalId = venueIds[i];
    const sibIds = allSiblingIds[i];
    const groupVenues = sibIds.map((id) => venueById.get(id)).filter(Boolean) as typeof venues;
    if (groupVenues.length === 0) continue;

    const canonical = groupVenues.find((v) => v.id === canonicalId) ?? groupVenues[0];

    const seen = new Set<string>();
    const allSessions: typeof groupVenues[0]["sessions"] = [];
    for (const gv of groupVenues) {
      for (const s of gv.sessions) {
        const key = `${s.referenceCode}:${s.scrapedDate}`;
        if (!seen.has(key)) {
          seen.add(key);
          allSessions.push(s);
        }
      }
    }

    const totalJoined = allSessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0), 0);
    const totalCapacity = allSessions.reduce((s, x) => s + x.maxPlayers, 0);
    const avgFee = allSessions.length > 0
      ? allSessions.reduce((s, x) => s + x.feeAmount, 0) / allSessions.length
      : 0;
    const fillRate = totalCapacity > 0 ? totalJoined / totalCapacity : 0;
    const revenue = allSessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0) * x.feeAmount, 0);
    const uniqueClubs = new Set(allSessions.map((s) => s.club.slug)).size;

    const hourlyActivity = Array.from({ length: 24 }, (_, h) => {
      return allSessions.filter((s) => {
        const start = parseInt(s.startTime.split(":")[0]);
        const end = parseInt(s.endTime.split(":")[0]) || 24;
        return h >= start && h < end;
      }).length;
    });
    const activeHours = hourlyActivity.filter((n) => n > 0).length;

    results.push({
      id: canonical.id,
      name: canonical.name,
      address: canonical.address,
      sessionsToday: allSessions.length,
      totalJoined,
      totalCapacity,
      fillRate: Math.round(fillRate * 100) / 100,
      avgFee: Math.round(avgFee),
      revenueEstimate: revenue,
      uniqueClubs,
      activeHours,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Heatmap aggregation query
// ---------------------------------------------------------------------------

export interface HeatmapVenueClub {
  venueName: string;
  venueId: string;
  slug: string;
  players: number;
  sessions: number;
}

export interface HeatmapVenue {
  /** Comma-separated snapped coordinate key (for stable identity) */
  coordKey: string;
  /** All venue IDs merged at this coordinate */
  venueIds: string[];
  venueName: string;
  lat: number;
  lng: number;
  /** Unique player counts keyed by DUPR bucket string, e.g. "3.1", "2.5" */
  playersByDupr: Record<string, number>;
  totalSessions90d: number;
  /** Per-club breakdown at this physical location */
  clubs: HeatmapVenueClub[];
}

export interface HeatmapData {
  venues: HeatmapVenue[];
  duprRange: { min: number; max: number };
  medianDupr: number;
  totalPlayersWithDupr: number;
}

/** Snap a coordinate to a ~100 m grid for deduplication. */
function snapCoord(coord: number): number {
  return Math.round(coord / 0.0009) * 0.0009;
}

/**
 * Builds heatmap data: per-location player counts bucketed by DUPR (0.1 steps),
 * looking back 90 days at session roster data.
 *
 * Duplicate venue rows at the same physical location (within ~33 m) are merged
 * using coordinate snapping. No player names are returned.
 */
export async function getHeatmapData(): Promise<HeatmapData> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const rosters = await prisma.sessionRoster.findMany({
    where: {
      session: {
        scrapedDate: { gte: cutoffStr },
        venue: { isNot: null },
      },
      isConfirmed: true,
    },
    select: {
      userId: true,
      session: {
        select: {
          id: true,
          venueId: true,
          venue: { select: { id: true, name: true, latitude: true, longitude: true } },
          club: { select: { id: true, name: true, slug: true } },
        },
      },
      player: {
        select: { duprSingles: true, duprDoubles: true },
      },
    },
  });

  // Step 1: Aggregate per venue_id (raw, before coordinate merge)
  const rawMap = new Map<
    number,
    {
      name: string;
      lat: number;
      lng: number;
      sessions: Set<number>;
      buckets: Map<string, Set<string>>; // duprBucket -> Set<userId>
      // club_id -> { name, slug, sessions, unique players }
      clubs: Map<number, { name: string; slug: string; sessions: Set<number>; players: Set<string> }>;
    }
  >();

  const allDuprValues: number[] = [];

  for (const roster of rosters) {
    const venue = roster.session.venue;
    if (!venue) continue;

    const vid = venue.id;
    if (!rawMap.has(vid)) {
      rawMap.set(vid, {
        name: venue.name,
        lat: venue.latitude,
        lng: venue.longitude,
        sessions: new Set(),
        buckets: new Map(),
        clubs: new Map(),
      });
    }

    const entry = rawMap.get(vid)!;
    entry.sessions.add(roster.session.id);

    // Track club-level breakdown
    const club = roster.session.club;
    if (club) {
      if (!entry.clubs.has(club.id)) {
        entry.clubs.set(club.id, { name: club.name, slug: club.slug ?? "", sessions: new Set(), players: new Set() });
      }
      const clubEntry = entry.clubs.get(club.id)!;
      clubEntry.sessions.add(roster.session.id);
      clubEntry.players.add(roster.userId.toString());
    }

    const rawDupr =
      roster.player?.duprDoubles != null
        ? Number(roster.player.duprDoubles)
        : roster.player?.duprSingles != null
          ? Number(roster.player.duprSingles)
          : null;

    if (rawDupr === null || rawDupr <= 0) continue;

    const bucket = (Math.floor(rawDupr * 10) / 10).toFixed(1);
    if (!entry.buckets.has(bucket)) {
      entry.buckets.set(bucket, new Set());
    }
    entry.buckets.get(bucket)!.add(roster.userId.toString());
    allDuprValues.push(rawDupr);
  }

  // Step 2: Merge venue_ids by snapped coordinate
  const coordGroups = new Map<
    string,
    {
      lat: number;
      lng: number;
      venueIds: number[];
      canonName: string;
      sessions: Set<number>;
      buckets: Map<string, Set<string>>;
      // club_id -> { name, slug, sessions, unique players } — merged across all venue_ids at this coord
      clubs: Map<number, { name: string; slug: string; sessions: Set<number>; players: Set<string> }>;
    }
  >();

  for (const [vid, raw] of rawMap) {
    const key = `${snapCoord(raw.lat).toFixed(4)},${snapCoord(raw.lng).toFixed(4)}`;

    if (!coordGroups.has(key)) {
      coordGroups.set(key, {
        lat: raw.lat,
        lng: raw.lng,
        venueIds: [],
        canonName: raw.name,
        sessions: new Set(),
        buckets: new Map(),
        clubs: new Map(),
      });
    }

    const group = coordGroups.get(key)!;
    group.venueIds.push(vid);

    for (const sid of raw.sessions) group.sessions.add(sid);

    for (const [bucket, players] of raw.buckets) {
      if (!group.buckets.has(bucket)) {
        group.buckets.set(bucket, new Set());
      }
      for (const uid of players) group.buckets.get(bucket)!.add(uid);
    }

    // Merge club breakdowns across duplicate venue_ids at this coord
    for (const [clubId, clubData] of raw.clubs) {
      if (!group.clubs.has(clubId)) {
        group.clubs.set(clubId, { name: clubData.name, slug: clubData.slug, sessions: new Set(), players: new Set() });
      }
      const gc = group.clubs.get(clubId)!;
      for (const sid of clubData.sessions) gc.sessions.add(sid);
      for (const uid of clubData.players) gc.players.add(uid);
    }
  }

  // Step 3: Build response
  const venues: HeatmapVenue[] = [];
  for (const [key, group] of coordGroups) {
    const playersByDupr: Record<string, number> = {};
    for (const [bucket, players] of group.buckets) {
      playersByDupr[bucket] = players.size;
    }

    // Build club list from actual club entities, sorted by player count desc
    const clubs: HeatmapVenueClub[] = [...group.clubs.values()]
      .map((c) => ({
        venueName: c.name,
        venueId: group.venueIds[0] ? String(group.venueIds[0]) : "",
        slug: c.slug,
        players: c.players.size,
        sessions: c.sessions.size,
      }))
      .filter((c) => c.players > 0 || c.sessions > 0)
      .sort((a, b) => b.players - a.players);

    venues.push({
      coordKey: key,
      venueIds: group.venueIds.map(String),
      venueName: group.canonName,
      lat: group.lat,
      lng: group.lng,
      playersByDupr,
      totalSessions90d: group.sessions.size,
      clubs,
    });
  }

  venues.sort((a, b) => {
    const aTotal = Object.values(a.playersByDupr).reduce((s, n) => s + n, 0);
    const bTotal = Object.values(b.playersByDupr).reduce((s, n) => s + n, 0);
    return bTotal - aTotal;
  });

  const uniquePlayersWithDupr = new Set(
    rosters
      .filter((r) => r.player?.duprDoubles != null || r.player?.duprSingles != null)
      .map((r) => r.userId.toString()),
  );

  let duprMin = 2.0;
  let duprMax = 6.0;
  let medianDupr = 4.0;
  if (allDuprValues.length > 0) {
    duprMin = Math.floor(Math.min(...allDuprValues) * 10) / 10;
    duprMax = Math.ceil(Math.max(...allDuprValues) * 10) / 10;
    const sorted = [...allDuprValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianDupr =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    medianDupr = Math.round(medianDupr * 10) / 10;
  }

  return {
    venues,
    duprRange: { min: duprMin, max: duprMax },
    medianDupr,
    totalPlayersWithDupr: uniquePlayersWithDupr.size,
  };
}

// ---------------------------------------------------------------------------
// Club DUPR distribution query
// ---------------------------------------------------------------------------

export interface DuprBucket {
  bucket: string;  // e.g. "3.4" representing the 3.3–3.5 band
  count: number;
}

export interface ClubDuprDistribution {
  buckets: DuprBucket[];
  totalRatedPlayers: number;
  medianDupr: number | null;
  topBucket: string | null;
}

/**
 * Returns the DUPR distribution (doubles only) for players who attended any
 * session run by this club in the last 90 days.
 * Players without dupr_doubles are excluded entirely.
 */
export async function getClubDuprDistribution(clubSlug: string): Promise<ClubDuprDistribution> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const rosters = await prisma.sessionRoster.findMany({
    where: {
      isConfirmed: true,
      session: {
        scrapedDate: { gte: cutoffStr },
        club: { slug: clubSlug },
      },
      player: {
        duprDoubles: { not: null },
      },
    },
    select: {
      userId: true,
      player: { select: { duprDoubles: true } },
    },
  });

  if (rosters.length === 0) {
    return { buckets: [], totalRatedPlayers: 0, medianDupr: null, topBucket: null };
  }

  // Deduplicate players — each unique player counted once with their current DUPR
  const playerDupr = new Map<string, number>();
  for (const r of rosters) {
    if (r.player?.duprDoubles == null) continue;
    const uid = r.userId.toString();
    if (!playerDupr.has(uid)) {
      playerDupr.set(uid, Number(r.player.duprDoubles));
    }
  }

  const allValues = [...playerDupr.values()].filter((v) => v > 0);
  if (allValues.length === 0) {
    return { buckets: [], totalRatedPlayers: 0, medianDupr: null, topBucket: null };
  }

  // Bucket by 0.1 precision (floor)
  const bucketMap = new Map<string, number>();
  for (const v of allValues) {
    const b = (Math.floor(v * 10) / 10).toFixed(1);
    bucketMap.set(b, (bucketMap.get(b) ?? 0) + 1);
  }

  // Build sorted bucket array
  const buckets: DuprBucket[] = [...bucketMap.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => parseFloat(a.bucket) - parseFloat(b.bucket));

  // Median
  const sorted = [...allValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianRaw =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const medianDupr = Math.round(medianRaw * 10) / 10;

  // Top bucket
  let topBucket: string | null = null;
  let topCount = 0;
  for (const { bucket, count } of buckets) {
    if (count > topCount) {
      topCount = count;
      topBucket = bucket;
    }
  }

  return {
    buckets,
    totalRatedPlayers: playerDupr.size,
    medianDupr,
    topBucket,
  };
}

export async function getVenueAnalytics(venueId: number) {
  const siblingIds = await resolveVenueSiblingIds(venueId);

  const venues = await prisma.venue.findMany({
    where: { id: { in: siblingIds } },
    include: {
      sessions: {
        orderBy: { scrapedDate: "desc" },
        include: {
          club: true,
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (venues.length === 0) return null;

  const venue = venues.find((v) => v.id === venueId) ?? venues[0];

  // Deduplicate sessions by referenceCode+scrapedDate across sibling venues
  const seen = new Set<string>();
  const allSessions = [];
  for (const v of venues) {
    for (const s of v.sessions) {
      const key = `${s.referenceCode}:${s.scrapedDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        allSessions.push(s);
      }
    }
  }

  const today = vnCalendarDateString(0);
  const todaySessions = allSessions
    .filter((s) => s.scrapedDate === today)
    .map((s) => {
      const snap = s.snapshots[0];
      return { ...s, joined: snap?.joined ?? 0, waitlisted: snap?.waitlisted ?? 0 };
    });

  const clubBreakdown: Record<string, { slug: string; name: string; sessions: number; totalJoined: number; totalCapacity: number }> = {};
  for (const s of allSessions) {
    const snap = s.snapshots[0];
    const key = s.club.slug || `club-${s.clubId}`;
    if (!clubBreakdown[key]) {
      clubBreakdown[key] = { slug: key, name: s.club.name, sessions: 0, totalJoined: 0, totalCapacity: 0 };
    }
    clubBreakdown[key].sessions++;
    clubBreakdown[key].totalJoined += snap?.joined ?? 0;
    clubBreakdown[key].totalCapacity += s.maxPlayers;
  }

  const hourlyUtilization = Array.from({ length: 24 }, (_, h) => {
    const hourSessions = todaySessions.filter((s) => {
      const startHour = parseInt(s.startTime.split(":")[0]);
      const endHour = parseInt(s.endTime.split(":")[0]) || 24;
      return h >= startHour && h < endHour;
    });
    return {
      hour: h,
      sessions: hourSessions.length,
      totalPlayers: hourSessions.reduce((sum, s) => sum + s.joined, 0),
    };
  });

  return {
    venue,
    todaySessions,
    clubBreakdown: Object.values(clubBreakdown),
    hourlyUtilization,
  };
}
