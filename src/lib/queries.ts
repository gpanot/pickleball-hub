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

export async function getSessionsLastScrapedAt(date?: string) {
  const targetDate = date || vnCalendarDateString(0);
  const result = await prisma.dailySnapshot.findFirst({
    where: { session: { scrapedDate: targetDate } },
    orderBy: { scrapedAt: "desc" },
    select: { scrapedAt: true },
  });
  return result?.scrapedAt ?? null;
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
    };
  });
}

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

export async function getOrganizerStats(clubId: number) {
  const sessions = await prisma.session.findMany({
    where: { clubId },
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
