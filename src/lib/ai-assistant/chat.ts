import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { deepseekClient } from "@/lib/deepseek";
import {
  buildHeatmapContext,
  buildContextString,
  loadAiChatSettings,
  type HeatmapContext,
} from "./context";

// ─── Provider detection ───────────────────────────────────────────────────────

function getProvider(model: string): "anthropic" | "deepseek" {
  if (model.startsWith("deepseek")) return "deepseek";
  return "anthropic";
}

// ─── Cost estimator ───────────────────────────────────────────────────────────

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  if (model.startsWith("deepseek")) {
    // DeepSeek V3: $0.27/1M input, $1.10/1M output
    return inputTokens * 0.00000027 + outputTokens * 0.0000011;
  }
  if (model.includes("haiku")) {
    // Haiku: $1/1M input, $5/1M output
    return inputTokens * 0.000001 + outputTokens * 0.000005;
  }
  // Sonnet: $3/1M input, $15/1M output
  return inputTokens * 0.000003 + outputTokens * 0.000015;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SendAiMessageResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    model: string;
  };
  contextMeta: {
    builtAt: string;
    sessionCount: number;
    venueCount: number;
    clubCount: number;
    estimatedTokens: number;
  } | null;
}

export function buildSystemPrompt(
  context: HeatmapContext,
  playerProfile?: Record<string, unknown>,
): string {
  const profileContext =
    playerProfile && Object.keys(playerProfile).filter((k) => k !== "updatedAt").length > 0
      ? `\nWhat I remember about this player from previous conversations:\n${Object.entries(
          playerProfile,
        )
          .filter(([key]) => key !== "updatedAt")
          .map(([key, value]) => `- ${key}: ${value}`)
          .join("\n")}\nUse this to give personalized recommendations without asking for information you already know.\n`
      : "";

  return `You are Pickle Pete — a friendly local pickleball guide in Ho Chi Minh City.
You know every court, every club, and every session in the city.
You speak like a helpful friend who plays pickleball, not like a database.
You are enthusiastic, concise, and always recommend the best option first.
You ask one follow-up question at the end to help narrow down the best session for the player.
You respond in the same language the player uses — Vietnamese or English.
Keep answers short and conversational — no walls of text, no tables, no headers.
If there are many options, pick the 3-5 best ones and briefly explain why.
${profileContext}
DATA RULES (strictly follow these):
- Only answer based on the data provided below. If something is not in your data, say so clearly.
- If the user challenges a fact you stated, re-check the data before responding. Do not apologize or retract a correct answer just because the user questions it. Only correct yourself if the data actually shows you were wrong.
- Never invent sessions, venues, clubs, or player counts that are not in the data.
- When recommending sessions, always include: time, venue, price, spots available, and DUPR range.
- If a session is full, say so clearly and suggest alternatives.
- Always be specific — name the actual venue and session, not generic advice.

FORMATTING RULES (strictly follow these):
- Never use markdown tables. Tables do not render on mobile.
- Never use ### headers or --- dividers.
- Use plain conversational text only.
- Use simple numbered lists or bullet points for multiple options.
- Keep responses under 200 words. If there are many sessions, show the top 5 most relevant ones and say "and X more available".
- Bold important info like price and spots using **text** sparingly — only for 1-2 key facts per response.
- Never dump all sessions at once. Curate the best options for the player's question.

SUGGESTION PILLS:
When you ask a follow-up question at the end of your response, provide 2-4 short answer options as pills. Return them after the profile_update tag in this exact format:

<suggestions>["This morning", "This afternoon", "After work 5pm+", "Tomorrow"]</suggestions>

Rules for suggestions:
- Only include when you are asking the player a specific question
- Keep each suggestion under 4 words
- Make them mutually exclusive options
- Maximum 4 suggestions
- If no follow-up question, return <suggestions>[]</suggestions>
- Never mention suggestions to the player — they appear as tappable buttons

PLAYER MEMORY:
After every response, extract anything useful you learned about this player that would help give better recommendations in future conversations. Return it as a JSON object in this exact format at the very end of your conversational reply, before the suggestions tag:

<profile_update>
{"dupr": 3.0, "district": "D1", "play_time": "evening"}
</profile_update>

Only include fields where you learned something new or updated. If you learned nothing new, return <profile_update>{}</profile_update>.
Fields can be anything meaningful — not limited to a fixed list. Use snake_case keys.
Never mention the profile update to the player — it is invisible to them.

Current data (use this as your single source of truth):
${buildContextString(context)}`;
}

// ─── Provider-specific callers ────────────────────────────────────────────────

async function callAnthropic(
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return {
    content: response.content[0]?.type === "text" ? response.content[0].text : "",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function callDeepSeek(
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const response = await deepseekClient.chat.completions.create({
    model,
    max_tokens: 1000,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return {
    content: response.choices[0]?.message.content ?? "",
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

/**
 * Send a single user message within a session and get an AI response.
 * Handles context caching, logging, cost calculation, and threshold warnings.
 */
export async function sendAiMessage({
  sessionId,
  message,
  history = [],
}: {
  sessionId: string;
  message: string;
  history?: ChatMessage[];
}): Promise<SendAiMessageResult> {
  // Load settings from DB (includes model, maxCostPerMessageUsd, etc.)
  const aiSettings = await loadAiChatSettings();
  // Tests can override the model via ANTHROPIC_MODEL env var
  const model = process.env.ANTHROPIC_MODEL ?? aiSettings.model;
  const provider = getProvider(model);

  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (provider === "deepseek" && !process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  // Resolve context — reuse snapshot if session already has one
  let context: HeatmapContext;
  let isFirstMessage: boolean;

  const existing = await prisma.aiAssistantLog.findFirst({
    where: { sessionId, contextSnapshot: { not: null } },
    select: { contextSnapshot: true },
  });

  if (existing?.contextSnapshot) {
    context = JSON.parse(existing.contextSnapshot) as HeatmapContext;
    isFirstMessage = false;
  } else {
    context = await buildHeatmapContext();
    isFirstMessage = true;
  }

  const userMsg: ChatMessage = { role: "user", content: message };
  const allMessages: ChatMessage[] = [...history, userMsg];

  // Log user message (with snapshot on first turn)
  await prisma.aiAssistantLog.create({
    data: {
      sessionId,
      role: "user",
      content: message,
      contextSnapshot: isFirstMessage ? JSON.stringify(context) : null,
    },
  });

  const systemPrompt = buildSystemPrompt(context);
  const result =
    provider === "deepseek"
      ? await callDeepSeek(model, systemPrompt, allMessages)
      : await callAnthropic(model, systemPrompt, allMessages);

  const { content: assistantText, inputTokens, outputTokens } = result;
  const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);

  // Cost threshold warning
  if (estimatedCostUsd > aiSettings.maxCostPerMessageUsd) {
    console.warn(
      `[ai-assistant] Cost warning: $${estimatedCostUsd.toFixed(6)} exceeds ` +
        `threshold $${aiSettings.maxCostPerMessageUsd} for session ${sessionId}`,
    );
  }

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

  return {
    content: assistantText,
    usage: { inputTokens, outputTokens, estimatedCostUsd, model },
    contextMeta: isFirstMessage
      ? {
          builtAt: context.builtAt,
          sessionCount: context.upcomingSessions.length,
          venueCount: context.venues.length,
          clubCount: context.clubs.length,
          estimatedTokens: context.estimatedTokens ?? 0,
        }
      : null,
  };
}

// Re-export for convenience
export { buildHeatmapContext, getOrCreateContextSnapshot } from "./context";
