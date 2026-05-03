import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SINGLETON_ID = "singleton";

const ALLOWED_MODELS = [
  "deepseek-chat",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6-20251001",
  "claude-opus-4-6-20251001",
];

const ALLOWED_CONTEXT_HOURS = [24, 48, 168]; // 168 = 7 days

async function getOrCreateSettings() {
  return prisma.aiChatSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/** GET /api/admin/ai-chat-settings */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings });
}

/** PATCH /api/admin/ai-chat-settings */
export async function PATCH(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate each field if present
  if (body.model !== undefined) {
    if (!ALLOWED_MODELS.includes(body.model as string)) {
      return NextResponse.json({ error: `Invalid model. Allowed: ${ALLOWED_MODELS.join(", ")}` }, { status: 400 });
    }
  }
  if (body.contextHours !== undefined) {
    if (!ALLOWED_CONTEXT_HOURS.includes(body.contextHours as number)) {
      return NextResponse.json({ error: "contextHours must be 24, 48, or 168" }, { status: 400 });
    }
  }
  if (body.maxVenues !== undefined) {
    const v = body.maxVenues as number;
    if (!Number.isInteger(v) || v < 10 || v > 100) {
      return NextResponse.json({ error: "maxVenues must be 10–100" }, { status: 400 });
    }
  }
  if (body.maxClubs !== undefined) {
    const v = body.maxClubs as number;
    if (!Number.isInteger(v) || v < 10 || v > 100) {
      return NextResponse.json({ error: "maxClubs must be 10–100" }, { status: 400 });
    }
  }
  if (body.maxCostPerMessageUsd !== undefined) {
    const v = body.maxCostPerMessageUsd as number;
    if (typeof v !== "number" || v < 0 || v > 10) {
      return NextResponse.json({ error: "maxCostPerMessageUsd must be 0–10" }, { status: 400 });
    }
  }
  if (body.dailyCostAlertUsd !== undefined) {
    const v = body.dailyCostAlertUsd as number;
    if (typeof v !== "number" || v < 0 || v > 1000) {
      return NextResponse.json({ error: "dailyCostAlertUsd must be 0–1000" }, { status: 400 });
    }
  }
  if (body.playerFacingEnabled !== undefined && typeof body.playerFacingEnabled !== "boolean") {
    return NextResponse.json({ error: "playerFacingEnabled must be boolean" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const key of [
    "model",
    "contextHours",
    "maxVenues",
    "maxClubs",
    "maxCostPerMessageUsd",
    "dailyCostAlertUsd",
    "playerFacingEnabled",
    "updatedBy",
  ]) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const updated = await prisma.aiChatSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });

  return NextResponse.json({ settings: updated });
}
