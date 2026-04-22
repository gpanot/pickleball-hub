import { prisma } from "./db";
import { vnCalendarDateString } from "./utils";

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

export async function getSessions(filters: SessionFilters = {}) {
  const today = filters.date || vnCalendarDateString(0);

  const where: Record<string, unknown> = {
    scrapedDate: today,
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
    },
    orderBy: { startTime: "asc" },
  });

  return sessions.map((s) => {
    const snap = s.snapshots[0];
    const joined = snap?.joined ?? 0;
    const waitlisted = snap?.waitlisted ?? 0;
    const fillRate = s.maxPlayers > 0 ? joined / s.maxPlayers : 0;

    return {
      ...s,
      joined,
      waitlisted,
      fillRate: Math.round(fillRate * 100) / 100,
    };
  });
}

export async function getClubs() {
  const todayStr = vnCalendarDateString(0);

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

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      numMembers: c.numMembers,
      reclubId: c.reclubId,
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
    };
  });
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
        },
      },
      dailyStats: {
        orderBy: { date: "desc" },
        take: 30,
      },
    },
  });

  return club;
}

export async function getVenues() {
  return prisma.venue.findMany({
    include: {
      _count: { select: { sessions: true } },
    },
    orderBy: { name: "asc" },
  });
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
        where: { scrapedDate: vnCalendarDateString(0) },
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

export async function getVenueComparison(venueIds: number[]) {
  const today = vnCalendarDateString(0);

  const venues = await prisma.venue.findMany({
    where: { id: { in: venueIds } },
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

  return venues.map((v) => {
    const todaySessions = v.sessions;
    const totalJoined = todaySessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0), 0);
    const totalCapacity = todaySessions.reduce((s, x) => s + x.maxPlayers, 0);
    const avgFee = todaySessions.length > 0
      ? todaySessions.reduce((s, x) => s + x.feeAmount, 0) / todaySessions.length
      : 0;
    const fillRate = totalCapacity > 0 ? totalJoined / totalCapacity : 0;
    const revenue = todaySessions.reduce((s, x) => s + (x.snapshots[0]?.joined ?? 0) * x.feeAmount, 0);
    const uniqueClubs = new Set(todaySessions.map((s) => s.club.slug)).size;

    const hourlyActivity = Array.from({ length: 24 }, (_, h) => {
      return todaySessions.filter((s) => {
        const start = parseInt(s.startTime.split(":")[0]);
        const end = parseInt(s.endTime.split(":")[0]) || 24;
        return h >= start && h < end;
      }).length;
    });
    const activeHours = hourlyActivity.filter((n) => n > 0).length;

    return {
      id: v.id,
      name: v.name,
      address: v.address,
      sessionsToday: todaySessions.length,
      totalJoined,
      totalCapacity,
      fillRate: Math.round(fillRate * 100) / 100,
      avgFee: Math.round(avgFee),
      revenueEstimate: revenue,
      uniqueClubs,
      activeHours,
    };
  });
}

export async function getVenueAnalytics(venueId: number) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: {
      sessions: {
        orderBy: { scrapedDate: "desc" },
        take: 200,
        include: {
          club: true,
          snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!venue) return null;

  const today = vnCalendarDateString(0);
  const todaySessions = venue.sessions
    .filter((s) => s.scrapedDate === today)
    .map((s) => {
      const snap = s.snapshots[0];
      return { ...s, joined: snap?.joined ?? 0, waitlisted: snap?.waitlisted ?? 0 };
    });

  const clubBreakdown: Record<string, { name: string; sessions: number; totalJoined: number; totalCapacity: number }> = {};
  for (const s of venue.sessions) {
    const snap = s.snapshots[0];
    const key = s.club.slug;
    if (!clubBreakdown[key]) {
      clubBreakdown[key] = { name: s.club.name, sessions: 0, totalJoined: 0, totalCapacity: 0 };
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
