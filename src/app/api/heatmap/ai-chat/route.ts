import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { deepseekClient } from "@/lib/deepseek";
import { buildHeatmapContext, loadAiChatSettings } from "@/lib/ai-assistant/context";
import { buildSystemPrompt, type ChatMessage } from "@/lib/ai-assistant/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (entry.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function getProvider(model: string): "anthropic" | "deepseek" {
  return model.startsWith("deepseek") ? "deepseek" : "anthropic";
}

function parseAiResponse(rawResponse: string): {
  cleanResponse: string;
  profileUpdate: Record<string, unknown>;
  suggestions: string[];
} {
  let text = rawResponse;

  // Extract profile update
  const profileMatch = text.match(/<profile_update>([\s\S]*?)<\/profile_update>/);
  let profileUpdate: Record<string, unknown> = {};
  if (profileMatch) {
    try {
      profileUpdate = JSON.parse(profileMatch[1]?.trim() ?? "{}") as Record<string, unknown>;
    } catch { /* ignore malformed */ }
    text = text.replace(/<profile_update>[\s\S]*?<\/profile_update>/, "").trim();
  }

  // Extract suggestions
  const suggestionsMatch = text.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
  let suggestions: string[] = [];
  if (suggestionsMatch) {
    try {
      const parsed = JSON.parse(suggestionsMatch[1]?.trim() ?? "[]");
      if (Array.isArray(parsed)) suggestions = parsed.filter((s) => typeof s === "string");
    } catch { /* ignore malformed */ }
    text = text.replace(/<suggestions>[\s\S]*?<\/suggestions>/, "").trim();
  }

  return { cleanResponse: text, profileUpdate, suggestions };
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  if (model.startsWith("deepseek")) return inputTokens * 0.00000027 + outputTokens * 0.0000011;
  if (model.includes("haiku")) return inputTokens * 0.000001 + outputTokens * 0.000005;
  return inputTokens * 0.000003 + outputTokens * 0.000015;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Check playerFacingEnabled first
  let settings: Awaited<ReturnType<typeof loadAiChatSettings>>;
  try {
    settings = await loadAiChatSettings();
  } catch (e) {
    console.error("[heatmap/ai-chat] Failed to load settings:", errMsg(e));
    return NextResponse.json({ error: "AI assistant is not available right now" }, { status: 503 });
  }

  if (!settings.playerFacingEnabled) {
    return NextResponse.json({ error: "AI assistant is not available right now" }, { status: 403 });
  }

  const provider = getProvider(settings.model);
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI assistant is not available right now" }, { status: 503 });
  }
  if (provider === "deepseek" && !process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json({ error: "AI assistant is not available right now" }, { status: 503 });
  }

  // Rate limit
  const ip = getClientIp(request);
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests, please try again later" },
      {
        status: 429,
        headers: {
          "Retry-After": "3600",
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // Parse body
  let body: { messages: ChatMessage[]; sessionId: string; profile?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { messages, sessionId, profile } = body;
  if (!messages?.length || !sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (lastMsg.content.length > 200) {
    return NextResponse.json({ error: "Message too long (max 200 characters)" }, { status: 400 });
  }

  // Context: reuse snapshot or build fresh
  let context: Awaited<ReturnType<typeof buildHeatmapContext>>;
  let isFirstMessage = false;

  try {
    const existing = await prisma.aiAssistantLog.findFirst({
      where: { sessionId, contextSnapshot: { not: null } },
      select: { contextSnapshot: true },
    });
    if (existing?.contextSnapshot) {
      context = JSON.parse(existing.contextSnapshot);
    } else {
      context = await buildHeatmapContext();
      isFirstMessage = true;
    }
  } catch (e) {
    console.error("[heatmap/ai-chat] Context build failed:", errMsg(e));
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const systemPrompt = buildSystemPrompt(context, profile);
  const safeMessages = messages.slice(-20); // never send more than last 20 turns

  // Log user message
  try {
    await prisma.aiAssistantLog.create({
      data: {
        sessionId,
        role: "user",
        content: lastMsg.content,
        source: "player",
        contextSnapshot: isFirstMessage ? JSON.stringify(context) : null,
      },
    });
  } catch (e) {
    console.error("[heatmap/ai-chat] Failed to log user message:", errMsg(e));
  }

  // Call provider
  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (provider === "deepseek") {
      const response = await deepseekClient.chat.completions.create({
        model: settings.model,
        max_tokens: 1000,
        messages: [
          { role: "system", content: systemPrompt },
          ...safeMessages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      assistantText = response.choices[0]?.message.content ?? "";
      inputTokens = response.usage?.prompt_tokens ?? 0;
      outputTokens = response.usage?.completion_tokens ?? 0;
    } else {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: settings.model,
        max_tokens: 1000,
        system: systemPrompt,
        messages: safeMessages.map((m) => ({ role: m.role, content: m.content })),
      });
      assistantText = response.content[0]?.type === "text" ? response.content[0].text : "";
      inputTokens = response.usage.input_tokens;
      outputTokens = response.usage.output_tokens;
    }
  } catch (e) {
    console.error("[heatmap/ai-chat] AI API error:", errMsg(e));
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  const estimatedCostUsd = estimateCost(settings.model, inputTokens, outputTokens);

  // Strip AI tags from the raw response
  const { cleanResponse, profileUpdate, suggestions } = parseAiResponse(assistantText);

  // Log assistant response (clean version, no tags)
  try {
    await prisma.aiAssistantLog.create({
      data: {
        sessionId,
        role: "assistant",
        content: cleanResponse,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
        source: "player",
      },
    });
  } catch (e) {
    console.error("[heatmap/ai-chat] Failed to log assistant message:", errMsg(e));
  }

  return NextResponse.json(
    { content: cleanResponse, profileUpdate, suggestions },
    {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
        "X-RateLimit-Remaining": String(remaining),
      },
    },
  );
}
