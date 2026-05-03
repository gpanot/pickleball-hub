import { prisma } from "@/lib/db";

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Raw structured context — kept for snapshot storage and meta counts. */
export interface HeatmapContext {
  venues: {
    name: string;
    address: string;
    sessionCount90d: number;
  }[];
  upcomingSessions: {
    date: string;           // YYYY-MM-DD in VN time
    startTime: string;      // HH:MM local
    endTime: string;        // HH:MM local
    club: string;
    venue: string;
    priceVnd: number;
    duprMin: number | null;
    duprMax: number | null;
    spotsTotal: number;
    spotsLeft: number;
    fillingStatus: "available" | "filling" | "full";
  }[];
  clubs: {
    name: string;
    activePlayerCount90d: number;
    avgDuprDoubles: string | null;
    primaryVenue: string | null;
  }[];
  builtAt: string;
  windowHours: number;
  /** Estimated token count of the serialised context string (chars ÷ 4). */
  estimatedTokens: number;
}

export interface ContextLimits {
  contextHours: number;
  maxVenues: number;
  maxClubs: number;
}

const DEFAULT_LIMITS: ContextLimits = {
  contextHours: 48,
  maxVenues: 20,
  maxClubs: 20,
};

// ─── Settings loader ──────────────────────────────────────────────────────────

/** Load AI chat settings from DB. Falls back to defaults if no row exists. */
export async function loadAiChatSettings() {
  try {
    const s = await prisma.aiChatSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
    console.log("[loadAiChatSettings] Loaded from DB:", {
      model: s.model,
      contextHours: s.contextHours,
      maxVenues: s.maxVenues,
      maxClubs: s.maxClubs,
      playerFacingEnabled: s.playerFacingEnabled,
      updatedAt: s.updatedAt,
    });
    return s;
  } catch (e) {
    console.warn("[loadAiChatSettings] DB error, falling back to defaults:", e);
    return {
      id: "singleton",
      model: process.env.ANTHROPIC_MODEL ?? "deepseek-chat",
      contextHours: DEFAULT_LIMITS.contextHours,
      maxVenues: DEFAULT_LIMITS.maxVenues,
      maxClubs: DEFAULT_LIMITS.maxClubs,
      maxCostPerMessageUsd: 0.05,
      dailyCostAlertUsd: 5.0,
      playerFacingEnabled: false,
      updatedAt: new Date(),
      updatedBy: null,
    };
  }
}

// ─── Individual fetchers ──────────────────────────────────────────────────────

async function fetchVenues(
  maxVenues: number,
  cutoff: string,
): Promise<HeatmapContext["venues"]> {
  const rows = await prisma.$queryRaw<
    { name: string; address: string; session_count: bigint }[]
  >`
    SELECT v.name, v.address,
           COUNT(DISTINCT s.id) AS session_count
    FROM venues v
    LEFT JOIN sessions s ON s.venue_id = v.id AND s.scraped_date >= ${cutoff}
    GROUP BY v.id, v.name, v.address
    ORDER BY session_count DESC
    LIMIT ${maxVenues}
  `;
  return rows.map((v) => ({
    name: v.name,
    address: v.address,
    sessionCount90d: Number(v.session_count),
  }));
}

async function fetchSessions(
  contextHours: number,
): Promise<HeatmapContext["upcomingSessions"]> {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = vnNow.toISOString().slice(0, 10);
  const currentTime = vnNow.toISOString().slice(11, 16); // HH:MM
  const windowEnd = new Date(vnNow.getTime() + contextHours * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // No take() — all sessions in the window
  const rows = await prisma.session.findMany({
    where: {
      scrapedDate: { gte: todayStr, lte: windowEnd },
      status: "active",
      durationMin: { lte: 360 },
      OR: [
        { scrapedDate: { gt: todayStr } },
        { scrapedDate: todayStr, startTime: { gte: currentTime } },
      ],
    },
    select: {
      scrapedDate: true,
      startTime: true,
      durationMin: true,
      feeAmount: true,
      skillLevelMin: true,
      skillLevelMax: true,
      maxPlayers: true,
      club: { select: { name: true } },
      venue: { select: { name: true } },
      snapshots: { orderBy: { scrapedAt: "desc" }, take: 1, select: { joined: true } },
    },
    orderBy: [{ scrapedDate: "asc" }, { startTime: "asc" }],
  });

  return rows.map((s) => {
    const joined = s.snapshots[0]?.joined ?? 0;
    const spotsLeft = Math.max(0, s.maxPlayers - joined);
    const fillPct = s.maxPlayers > 0 ? joined / s.maxPlayers : 0;
    const fillingStatus: "available" | "filling" | "full" =
      spotsLeft === 0 ? "full" : fillPct >= 0.75 ? "filling" : "available";

    const [h, m] = s.startTime.split(":").map(Number);
    const endMin = (h ?? 0) * 60 + (m ?? 0) + s.durationMin;
    const endTime = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    return {
      date: s.scrapedDate,
      startTime: s.startTime,
      endTime,
      club: s.club.name,
      venue: s.venue?.name ?? s.club.name,
      priceVnd: s.feeAmount,
      duprMin: s.skillLevelMin,
      duprMax: s.skillLevelMax,
      spotsTotal: s.maxPlayers,
      spotsLeft,
      fillingStatus,
    };
  });
}

async function fetchClubs(
  maxClubs: number,
  cutoff: string,
): Promise<HeatmapContext["clubs"]> {
  const rows = await prisma.$queryRaw<
    {
      name: string;
      player_count: bigint;
      avg_dupr: number | null;
      primary_venue: string | null;
    }[]
  >`
    SELECT c.name,
           COUNT(DISTINCT sr.user_id) AS player_count,
           AVG(p.dupr_doubles) AS avg_dupr,
           (
             SELECT v.name FROM venues v
             JOIN sessions s2 ON s2.venue_id = v.id
             WHERE s2.club_id = c.id AND s2.scraped_date >= ${cutoff}
             GROUP BY v.id, v.name
             ORDER BY COUNT(*) DESC
             LIMIT 1
           ) AS primary_venue
    FROM clubs c
    LEFT JOIN sessions s ON s.club_id = c.id AND s.scraped_date >= ${cutoff}
    LEFT JOIN session_rosters sr ON sr.session_id = s.id AND sr.is_confirmed = true
    LEFT JOIN players p ON p.user_id = sr.user_id AND p.dupr_doubles IS NOT NULL
    GROUP BY c.id, c.name
    ORDER BY player_count DESC
    LIMIT ${maxClubs}
  `;
  return rows.map((c) => ({
    name: c.name,
    activePlayerCount90d: Number(c.player_count),
    avgDuprDoubles: c.avg_dupr ? Number(c.avg_dupr).toFixed(2) : null,
    primaryVenue: c.primary_venue,
  }));
}

// ─── Compact plain-text serialiser ────────────────────────────────────────────

/** Truncate a string to maxLen chars, with no suffix. */
function trunc(s: string, maxLen: number) {
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/** Format price as compact VND: 120000 → "120k", 0 → "free" */
function fmtPrice(vnd: number) {
  if (vnd <= 0) return "free";
  return `${Math.round(vnd / 1000)}k`;
}

/** Format DUPR range: "3.0-4.0", "3.0+", or "any" */
function fmtDupr(min: number | null, max: number | null) {
  if (min == null && max == null) return "any";
  if (min != null && max != null) return `${min.toFixed(1)}-${max.toFixed(1)}`;
  if (min != null) return `${min.toFixed(1)}+`;
  return `<${max!.toFixed(1)}`;
}

/** VN weekday + date label, e.g. "TODAY Sun May 3" */
function dateSectionHeader(dateStr: string, todayStr: string) {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  const dayName = d.toLocaleString("en-US", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const monthDay = d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
  const prefix = dateStr === todayStr ? "TODAY" : dateStr === nextDay(todayStr) ? "TOMORROW" : "";
  return prefix ? `${prefix} ${dayName} ${monthDay}` : `${dayName} ${monthDay}`;
}

function nextDay(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Serialise a HeatmapContext to a compact plain-text string suitable for
 * inclusion in a Claude system prompt. Plain text avoids JSON overhead
 * (no repeated key names, quotes, braces) — ~15 tokens/session vs ~175.
 */
export function buildContextString(ctx: HeatmapContext): string {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = vnNow.toISOString().slice(0, 10);

  const lines: string[] = [];

  // ── Sessions ──────────────────────────────────────────────────────────────
  lines.push(`UPCOMING SESSIONS (next ${ctx.windowHours}h) — ${ctx.upcomingSessions.length} total`);

  let currentDate = "";
  for (const s of ctx.upcomingSessions) {
    if (s.date !== currentDate) {
      currentDate = s.date;
      lines.push(dateSectionHeader(s.date, todayStr));
    }
    const status = s.fillingStatus === "full" ? "full" : `${s.spotsLeft}/${s.spotsTotal} open`;
    const club = trunc(s.club, 22);
    const venue = trunc(s.venue, 22);
    // Format: "13:00-17:00 | Club | Venue | 3.0-4.0 | 120k | 32/56 open"
    lines.push(
      `${s.startTime}-${s.endTime} | ${club} | ${venue} | ${fmtDupr(s.duprMin, s.duprMax)} | ${fmtPrice(s.priceVnd)} | ${status}`,
    );
  }

  lines.push("");

  // ── Venues ───────────────────────────────────────────────────────────────
  lines.push(`TOP VENUES (by sessions last 90d) — top ${ctx.venues.length}`);
  for (const v of ctx.venues) {
    lines.push(`${v.name} | ${v.sessionCount90d} sessions`);
  }

  lines.push("");

  // ── Clubs ────────────────────────────────────────────────────────────────
  lines.push(`TOP CLUBS (by active players) — top ${ctx.clubs.length}`);
  for (const c of ctx.clubs) {
    const dupr = c.avgDuprDoubles ? `avg ${c.avgDuprDoubles} DUPR` : "no DUPR data";
    const venue = c.primaryVenue ? ` | ${c.primaryVenue}` : "";
    lines.push(`${c.name} | ${dupr} | ${c.activePlayerCount90d} players${venue}`);
  }

  return lines.join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build a fresh context from live DB data, respecting current AI chat settings. */
export async function buildHeatmapContext(
  overrides?: Partial<ContextLimits>,
): Promise<HeatmapContext> {
  let limits: ContextLimits = DEFAULT_LIMITS;
  let settingsSource = "defaults";

  if (!overrides) {
    try {
      const s = await loadAiChatSettings();
      limits = {
        contextHours: s.contextHours,
        maxVenues: s.maxVenues,
        maxClubs: s.maxClubs,
      };
      settingsSource = `db (id=${s.id})`;
    } catch (e) {
      console.warn("[buildHeatmapContext] Failed to load AiChatSettings, using defaults:", e);
      settingsSource = "defaults (error)";
    }
  } else {
    limits = { ...DEFAULT_LIMITS, ...overrides };
    settingsSource = "overrides";
  }

  console.log("[buildHeatmapContext] Settings source:", settingsSource, "| Limits:", limits);

  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [venues, upcomingSessions, clubs] = await Promise.all([
    fetchVenues(limits.maxVenues, cutoff90d),
    fetchSessions(limits.contextHours),
    fetchClubs(limits.maxClubs, cutoff90d),
  ]);

  const ctx: Omit<HeatmapContext, "estimatedTokens"> = {
    venues,
    upcomingSessions,
    clubs,
    builtAt: new Date().toISOString(),
    windowHours: limits.contextHours,
  };

  // Build the plain-text string and estimate token count
  const contextStr = buildContextString(ctx as HeatmapContext);
  const estimatedTokens = Math.round(contextStr.length / 4);

  console.log("[buildHeatmapContext] Context size:", {
    sessions: upcomingSessions.length,
    venues: venues.length,
    clubs: clubs.length,
    windowHours: limits.contextHours,
    estimatedTokens,
  });

  return { ...ctx, estimatedTokens };
}

/**
 * Returns the context for a given sessionId.
 * On the first call, builds fresh context and persists it.
 * On subsequent calls, returns the cached snapshot from the DB.
 */
export async function getOrCreateContextSnapshot(
  sessionId: string,
): Promise<HeatmapContext> {
  const existing = await prisma.aiAssistantLog.findFirst({
    where: { sessionId, contextSnapshot: { not: null } },
    select: { contextSnapshot: true },
  });

  if (existing?.contextSnapshot) {
    return JSON.parse(existing.contextSnapshot) as HeatmapContext;
  }

  const context = await buildHeatmapContext();

  const firstLog = await prisma.aiAssistantLog.findFirst({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (firstLog) {
    await prisma.aiAssistantLog.update({
      where: { id: firstLog.id },
      data: { contextSnapshot: JSON.stringify(context) },
    });
  } else {
    await prisma.aiAssistantLog.create({
      data: {
        sessionId,
        role: "_context",
        content: "",
        contextSnapshot: JSON.stringify(context),
      },
    });
  }

  return context;
}
