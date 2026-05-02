import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_TYPES = ["competitive_tonight", "club_spotlight", "heatmap_weekly"] as const;
type PostType = (typeof VALID_TYPES)[number];

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001":  { input: 0.80,  output: 4.00  },
  "claude-sonnet-4-6-20251001": { input: 3.00,  output: 15.00 },
  "claude-opus-4-6-20251001":   { input: 15.00, output: 75.00 },
};

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model] ?? { input: 3.0, output: 15.0 };
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ─── Data helpers ────────────────────────────────────────────────────────────

async function getSessionData() {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = vnNow.toISOString().slice(0, 10);
  const currentTime = vnNow.toISOString().slice(11, 16); // "HH:MM"
  const dayOfWeek = vnNow.toLocaleString("en-US", { weekday: "long" });

  // Total active sessions today (unrestricted, for context)
  const totalCount = await prisma.session.count({
    where: { scrapedDate: todayStr, status: "active", durationMin: { lte: 360 } },
  });

  // Evening competitive sessions: start_time >= 17:00, not yet started
  const competitiveRows = await prisma.session.findMany({
    where: {
      scrapedDate: todayStr,
      status: "active",
      durationMin: { lte: 360 },
      maxPlayers: { gt: 0 },
      startTime: { gte: "17:00", ...(currentTime >= "17:00" ? { gte: currentTime } : {}) },
      OR: [
        { skillLevelMin: { gte: 3.0 } },
        {
          duprStat: {
            duprParticipationPct: { gte: 40 },
            avgDuprDoubles: { gte: 3.0 },
          },
        },
      ],
    },
    include: {
      club: { select: { name: true, slug: true } },
      venue: { select: { name: true } },
      duprStat: { select: { avgDuprDoubles: true, duprParticipationPct: true } },
      snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
    },
    orderBy: { startTime: "asc" },
    take: 20,
  });

  // Fallback: all evening sessions not yet started, ordered by fill rate desc
  let fallbackRows: typeof competitiveRows = [];
  if (competitiveRows.length < 3) {
    const allEvening = await prisma.session.findMany({
      where: {
        scrapedDate: todayStr,
        status: "active",
        durationMin: { lte: 360 },
        maxPlayers: { gt: 0 },
        startTime: { gte: "17:00", ...(currentTime >= "17:00" ? { gte: currentTime } : {}) },
      },
      include: {
        club: { select: { name: true, slug: true } },
        venue: { select: { name: true } },
        duprStat: { select: { avgDuprDoubles: true, duprParticipationPct: true } },
        snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
      },
      orderBy: { startTime: "asc" },
      take: 20,
    });
    const seenIds = new Set(competitiveRows.map((s) => s.id));
    fallbackRows = allEvening
      .filter((s) => !seenIds.has(s.id))
      .sort((a, b) => {
        const fillA = (a.snapshots[0]?.joined ?? 0) / (a.maxPlayers || 1);
        const fillB = (b.snapshots[0]?.joined ?? 0) / (b.maxPlayers || 1);
        return fillB - fillA;
      });
  }

  const combined = [...competitiveRows, ...fallbackRows].slice(0, 8);

  const competitive = combined.map((s) => ({
    name: s.name,
    start_time: s.startTime,
    venue_name: s.venue?.name ?? s.club.name,
    club_name: s.club.name,
    spots_left: Math.max(0, s.maxPlayers - (s.snapshots[0]?.joined ?? 0)),
    avg_dupr: s.duprStat?.avgDuprDoubles
      ? Number(s.duprStat.avgDuprDoubles).toFixed(1)
      : null,
    fee_amount: s.feeAmount,
  }));

  return { competitive, total: totalCount, day_of_week: dayOfWeek, date: todayStr };
}

async function getClubSpotlight() {
  const index = Math.floor(Date.now() / 86400000) % 20;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const clubs = await prisma.$queryRaw<
    { id: number; name: string; slug: string; num_members: number; player_count: bigint }[]
  >`
    SELECT c.id, c.name, c.slug, c.num_members,
           COUNT(DISTINCT sr.user_id) AS player_count
    FROM clubs c
    JOIN sessions s ON s.club_id = c.id
    JOIN session_rosters sr ON sr.session_id = s.id
    WHERE s.scraped_date >= ${cutoff} AND sr.is_confirmed = true
    GROUP BY c.id, c.name, c.slug, c.num_members
    ORDER BY player_count DESC
    LIMIT 20
  `;

  if (!clubs.length) {
    return { name: "", slug: "", member_count: 0, median_dupr: null, top_dupr_buckets: [], total_rated_players: 0 };
  }

  const club = clubs[index % clubs.length];

  const buckets = await prisma.$queryRaw<{ bucket: number; player_count: bigint }[]>`
    SELECT FLOOR(p.dupr_doubles::numeric * 10) / 10 AS bucket,
           COUNT(DISTINCT sr.user_id) AS player_count
    FROM session_rosters sr
    JOIN sessions s ON s.id = sr.session_id
    JOIN players p ON p.user_id = sr.user_id
    WHERE s.club_id = ${club.id}
      AND s.scraped_date >= ${cutoff}
      AND p.dupr_doubles IS NOT NULL
      AND p.dupr_doubles > 0
      AND sr.is_confirmed = true
    GROUP BY bucket
    ORDER BY bucket
  `;

  const totalRated = buckets.reduce((s, r) => s + Number(r.player_count), 0);
  const top3 = [...buckets]
    .sort((a, b) => Number(b.player_count) - Number(a.player_count))
    .slice(0, 3)
    .map((r) => ({
      bucket: Number(r.bucket).toFixed(1),
      count: Number(r.player_count),
      pct: totalRated > 0 ? Math.round((Number(r.player_count) / totalRated) * 100) : 0,
    }));

  const allVals = buckets.flatMap((r) =>
    Array<number>(Number(r.player_count)).fill(Number(r.bucket)),
  );
  allVals.sort((a, b) => a - b);
  const mid = Math.floor(allVals.length / 2);
  const medianDupr =
    allVals.length === 0
      ? null
      : allVals.length % 2 === 0
        ? ((allVals[mid - 1]! + allVals[mid]!) / 2).toFixed(1)
        : allVals[mid]!.toFixed(1);

  return {
    name: club.name,
    slug: club.slug,
    member_count: club.num_members,
    median_dupr: medianDupr,
    top_dupr_buckets: top3,
    total_rated_players: totalRated,
  };
}

async function getHeatmapData() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const venues = await prisma.$queryRaw<
    { venue_name: string; player_count: bigint; sessions_90d: bigint }[]
  >`
    SELECT v.name AS venue_name,
           COUNT(DISTINCT sr.user_id) AS player_count,
           COUNT(DISTINCT s.id) AS sessions_90d
    FROM session_rosters sr
    JOIN sessions s ON s.id = sr.session_id
    JOIN venues v ON v.id = s.venue_id
    JOIN players p ON p.user_id = sr.user_id
    WHERE s.scraped_date >= ${cutoff}
      AND sr.is_confirmed = true
      AND p.dupr_doubles >= 3.0
      AND p.dupr_doubles < 3.5
    GROUP BY v.id, v.name
    ORDER BY player_count DESC
    LIMIT 10
  `;

  return {
    top_venues: venues.map((r) => ({
      name: r.venue_name,
      player_count: Number(r.player_count),
      sessions_90d: Number(r.sessions_90d),
    })),
  };
}

// ─── Claude call ─────────────────────────────────────────────────────────────

async function callClaude(
  sessionData: Awaited<ReturnType<typeof getSessionData>>,
  clubData: Awaited<ReturnType<typeof getClubSpotlight>>,
  heatmapData: Awaited<ReturnType<typeof getHeatmapData>>,
  isMonday: boolean,
  settings: { llmModel: string; temperature: number; maxTokens: number },
) {
  const baseUrl = process.env.BASE_URL ?? "https://hub.thecourtflow.com";
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You generate social media content for Pickleball Hub (${baseUrl}),
a session discovery platform for Vietnamese pickleball players in Ho Chi Minh City.

Today's data:
- Competitive sessions tonight: ${JSON.stringify(sessionData.competitive.slice(0, 5))}
- Club spotlight: ${JSON.stringify(clubData)}
- Top heatmap venues (DUPR 3.0-3.5): ${JSON.stringify(heatmapData.top_venues.slice(0, 5))}
- Day of week: ${sessionData.day_of_week}
- Total sessions today: ${sessionData.total}
- Is Monday: ${isMonday}

Generate 3 posts entirely in Vietnamese:

POST 1 — "competitive_tonight"
Lead with the sessions, never with the platform name.
Format: emoji header, date in Vietnamese, 3 sessions each on one line with
time / venue name / spots left / score rating, link at the very end.

POST 2 — "club_spotlight"
Highlight one club. Tone: knowledgeable community member.
Include club name, member count, median DUPR, top 3 DUPR buckets with percentages,
link: ${baseUrl}/clubs/[slug]. Never use "algorithm" or "data".

POST 3 — "heatmap_weekly" (Monday only — return empty string if not Monday)
Top 5 venues for DUPR 3.0-3.5 players with player counts.
End with: ${baseUrl}/heatmap

Rules: Vietnamese only, no exclamation marks, under 300 chars each, no https prefix in links.

Return ONLY valid JSON:
{"competitive_tonight":"...","club_spotlight":"...","heatmap_weekly":""}
No markdown, no preamble.`;

  const response = await client.messages.create({
    model: settings.llmModel,
    max_tokens: settings.maxTokens,
    temperature: settings.temperature,
    messages: [{ role: "user", content: prompt }],
  });

  // Log usage (best-effort — don't let a DB error block the response)
  try {
    const cost = calcCost(
      settings.llmModel,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );
    await prisma.llmUsageLog.create({
      data: {
        model: settings.llmModel,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd: cost,
        postType: "content_generation",
      },
    });
  } catch (logErr) {
    console.error("[generate] usage log failed (non-fatal):", logErr);
  }

  const rawText = (response.content[0] as { type: string; text: string }).text.trim();
  console.log("[generate] raw Claude response:", rawText.slice(0, 300));

  let cleaned = rawText;
  if (cleaned.startsWith("```")) {
    const parts = cleaned.split("```");
    cleaned = parts[1] ?? "";
    if (cleaned.startsWith("json")) cleaned = cleaned.slice(4);
  }
  cleaned = cleaned.trim();

  let parsed: Record<PostType, string>;
  try {
    parsed = JSON.parse(cleaned) as Record<PostType, string>;
  } catch (parseErr) {
    throw new Error(`Claude response was not valid JSON. Raw text:\n${rawText}`);
  }

  return {
    parsed,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: settings.llmModel,
    },
  };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const log = (step: string, detail?: unknown) =>
    console.log(`[generate] ${step}`, detail !== undefined ? detail : "");

  try {
    // 1. Auth
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    log("auth ok");

    // 2. Body
    const body = (await request.json().catch(() => ({}))) as { postType?: string };
    const targetType = (body.postType ?? null) as PostType | null;
    if (targetType && !VALID_TYPES.includes(targetType)) {
      return NextResponse.json(
        { error: `Invalid postType. Valid: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    log("body", { targetType });

    // 3. API key check
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set on this server" }, { status: 503 });
    }
    log("api key present");

    // 4. Load admin settings (upsert ensures singleton exists)
    let adminSettings;
    try {
      adminSettings = await prisma.adminSettings.upsert({
        where: { id: "singleton" },
        create: { id: "singleton" },
        update: {},
      });
    } catch (e) {
      return NextResponse.json(
        { error: `DB error loading settings: ${errMsg(e)}` },
        { status: 500 },
      );
    }
    log("settings", {
      model: adminSettings.llmModel,
      temp: adminSettings.temperature,
      maxTokens: adminSettings.maxTokens,
      budget: adminSettings.monthlyBudgetUsd,
    });

    // 5. Budget check
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const monthStart = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-01`;
    let monthSpend = 0;
    try {
      const logs = await prisma.llmUsageLog.findMany({
        where: { createdAt: { gte: new Date(`${monthStart}T00:00:00+07:00`) } },
        select: { costUsd: true },
      });
      monthSpend = logs.reduce((s, r) => s + r.costUsd, 0);
    } catch (e) {
      log("budget check failed (non-fatal)", errMsg(e));
    }
    if (monthSpend >= adminSettings.monthlyBudgetUsd) {
      return NextResponse.json(
        {
          error: `Monthly budget reached ($${monthSpend.toFixed(4)} / $${adminSettings.monthlyBudgetUsd.toFixed(2)}). Update budget in Settings.`,
        },
        { status: 402 },
      );
    }
    log("budget ok", { monthSpend });

    // 6. Fetch ALL context data from DB in one shot, then disconnect before calling Claude
    log("fetching context data...");
    let sessionData: Awaited<ReturnType<typeof getSessionData>>;
    let clubData: Awaited<ReturnType<typeof getClubSpotlight>>;
    let heatmapData: Awaited<ReturnType<typeof getHeatmapData>>;
    try {
      [sessionData, clubData, heatmapData] = await Promise.all([
        getSessionData(),
        getClubSpotlight(),
        getHeatmapData(),
      ]);
    } catch (e) {
      return NextResponse.json(
        { error: `DB error fetching context: ${errMsg(e)}` },
        { status: 500 },
      );
    }
    log("context fetched", {
      sessions: sessionData.total,
      competitive: sessionData.competitive.length,
      date: sessionData.date,
      club: clubData.name,
      venues: heatmapData.top_venues.length,
    });

    // Explicitly disconnect so the pool doesn't time out during the ~15s Claude call
    try { await prisma.$disconnect(); } catch { /* ignore */ }

    // 7. Call Claude
    log("calling Claude...", adminSettings.llmModel);
    const isMonday = vnNow.getDay() === 1;
    let claudeResult: Awaited<ReturnType<typeof callClaude>>;
    try {
      claudeResult = await callClaude(
        sessionData,
        clubData,
        heatmapData,
        isMonday || targetType === "heatmap_weekly",
        {
          llmModel: adminSettings.llmModel,
          temperature: adminSettings.temperature,
          maxTokens: adminSettings.maxTokens,
        },
      );
    } catch (e) {
      return NextResponse.json(
        { error: `Claude API error: ${errMsg(e)}` },
        { status: 500 },
      );
    }
    log("Claude done", claudeResult.usage);

    // 8. Save posts to DB
    const scheduledDate = new Date();
    const typesToSave: PostType[] = targetType
      ? [targetType]
      : ([
          "competitive_tonight",
          "club_spotlight",
          ...(isMonday ? (["heatmap_weekly"] as PostType[]) : []),
        ] as PostType[]);

    let postsCreated = 0;
    try {
      for (const pt of typesToSave) {
        const text = claudeResult.parsed[pt];
        if (!text) {
          log(`skipping ${pt} — empty text`);
          continue;
        }
        for (const channel of ["zalo_oa", "facebook"] as const) {
          await prisma.contentPost.create({
            data: { postType: pt, channel, generatedText: text, status: "pending", scheduledDate },
          });
          postsCreated++;
        }
      }
    } catch (e) {
      return NextResponse.json(
        { error: `DB error saving posts: ${errMsg(e)}` },
        { status: 500 },
      );
    }
    log("posts saved", { postsCreated, types: typesToSave });

    return NextResponse.json({
      ok: true,
      postsCreated,
      typesGenerated: typesToSave,
      usage: claudeResult.usage,
    });
  } catch (e) {
    // Catch-all — should never reach here given per-step catches above
    console.error("[generate] unhandled error:", e);
    return NextResponse.json(
      { error: `Unexpected error: ${errMsg(e)}` },
      { status: 500 },
    );
  }
}
