import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// claude-sonnet-4-20250514 pricing per million tokens
const INPUT_COST_PER_TOKEN = 3.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000;

const MODEL = "claude-sonnet-4-20250514";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── Context helpers ──────────────────────────────────────────────────────────

async function getVenuesWithSessionCounts() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const venues = await prisma.$queryRaw<
    {
      id: number;
      name: string;
      address: string;
      session_count: bigint;
    }[]
  >`
    SELECT v.id, v.name, v.address,
           COUNT(DISTINCT s.id) AS session_count
    FROM venues v
    LEFT JOIN sessions s ON s.venue_id = v.id AND s.scraped_date >= ${cutoff}
    GROUP BY v.id, v.name, v.address
    ORDER BY session_count DESC
    LIMIT 30
  `;

  return venues.map((v) => ({
    name: v.name,
    address: v.address,
    sessionCount90d: Number(v.session_count),
  }));
}

async function getUpcomingSessions() {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayStr = vnNow.toISOString().slice(0, 10);
  const currentTime = vnNow.toISOString().slice(11, 16);

  const sessions = await prisma.session.findMany({
    where: {
      scrapedDate: todayStr,
      status: "active",
      durationMin: { lte: 360 },
      startTime: { gte: currentTime },
    },
    include: {
      club: { select: { name: true } },
      venue: { select: { name: true } },
      snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
    },
    orderBy: { startTime: "asc" },
    take: 20,
  });

  return sessions.map((s) => ({
    name: s.name,
    club: s.club.name,
    venue: s.venue?.name ?? s.club.name,
    time: s.startTime,
    priceVnd: s.feeAmount,
    duprMin: s.skillLevelMin,
    duprMax: s.skillLevelMax,
    spotsLeft: Math.max(0, s.maxPlayers - (s.snapshots[0]?.joined ?? 0)),
    maxPlayers: s.maxPlayers,
  }));
}

async function getClubsWithPlayerCounts() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const clubs = await prisma.$queryRaw<
    {
      id: number;
      name: string;
      num_members: number;
      player_count: bigint;
      avg_dupr: number | null;
      primary_venue: string | null;
    }[]
  >`
    SELECT c.id, c.name, c.num_members,
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
    GROUP BY c.id, c.name, c.num_members
    ORDER BY player_count DESC
    LIMIT 20
  `;

  return clubs.map((c) => ({
    name: c.name,
    memberCount: c.num_members,
    activePlayerCount90d: Number(c.player_count),
    avgDuprDoubles: c.avg_dupr ? Number(c.avg_dupr).toFixed(2) : null,
    primaryVenue: c.primary_venue,
  }));
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(context: {
  venues: Awaited<ReturnType<typeof getVenuesWithSessionCounts>>;
  upcomingSessions: Awaited<ReturnType<typeof getUpcomingSessions>>;
  clubs: Awaited<ReturnType<typeof getClubsWithPlayerCounts>>;
  lastUpdated: string;
}) {
  return `You are a helpful assistant for HCM pickleball players looking for places to play in Ho Chi Minh City, Vietnam.
You have access to real-time data about venues, clubs, and upcoming sessions.
Answer questions concisely and in the same language the player uses (Vietnamese or English).
If asked about something not in your data, say you don't have that information rather than guessing.
Always recommend specific venues or sessions when relevant, using the data provided.

Current data (as of ${context.lastUpdated}):
${JSON.stringify(context, null, 2)}`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    );
  }

  let body: { messages: ChatMessage[]; sessionId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, sessionId } = body;
  if (!messages?.length || !sessionId) {
    return NextResponse.json(
      { error: "messages and sessionId are required" },
      { status: 400 },
    );
  }

  // Build context from live DB data
  let context: {
    venues: Awaited<ReturnType<typeof getVenuesWithSessionCounts>>;
    upcomingSessions: Awaited<ReturnType<typeof getUpcomingSessions>>;
    clubs: Awaited<ReturnType<typeof getClubsWithPlayerCounts>>;
    lastUpdated: string;
  };
  try {
    const [venues, upcomingSessions, clubs] = await Promise.all([
      getVenuesWithSessionCounts(),
      getUpcomingSessions(),
      getClubsWithPlayerCounts(),
    ]);
    context = { venues, upcomingSessions, clubs, lastUpdated: new Date().toISOString() };
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to load context: ${errMsg(e)}` },
      { status: 500 },
    );
  }

  const systemPrompt = buildSystemPrompt(context);

  // Log the user message
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === "user") {
    try {
      await prisma.aiAssistantLog.create({
        data: {
          sessionId,
          role: "user",
          content: lastUserMessage.content,
        },
      });
    } catch (e) {
      console.error("[ai-assistant] Failed to log user message:", e);
    }
  }

  // Call Claude
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Claude API error: ${errMsg(e)}` },
      { status: 500 },
    );
  }

  const assistantText =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const estimatedCostUsd =
    inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  // Log the assistant response
  try {
    await prisma.aiAssistantLog.create({
      data: {
        sessionId,
        role: "assistant",
        content: assistantText,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
      },
    });
  } catch (e) {
    console.error("[ai-assistant] Failed to log assistant message:", e);
  }

  return NextResponse.json({
    content: assistantText,
    usage: { inputTokens, outputTokens, estimatedCostUsd },
  });
}
