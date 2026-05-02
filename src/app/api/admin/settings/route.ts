import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/admin/settings */
export async function GET(_request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.adminSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return NextResponse.json({ settings });
}

/** POST /api/admin/settings */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    llmModel?: string;
    temperature?: number;
    maxTokens?: number;
    monthlyBudgetUsd?: number;
  };

  const allowedModels = [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6-20251001",
    "claude-opus-4-6-20251001",
  ];
  if (body.llmModel && !allowedModels.includes(body.llmModel)) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }
  if (body.temperature !== undefined && (body.temperature < 0 || body.temperature > 1)) {
    return NextResponse.json({ error: "Temperature must be 0–1" }, { status: 400 });
  }
  if (body.maxTokens !== undefined && (body.maxTokens < 100 || body.maxTokens > 8192)) {
    return NextResponse.json({ error: "maxTokens must be 100–8192" }, { status: 400 });
  }
  if (body.monthlyBudgetUsd !== undefined && body.monthlyBudgetUsd < 0) {
    return NextResponse.json({ error: "Budget must be ≥ 0" }, { status: 400 });
  }

  const updated = await prisma.adminSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      ...(body.llmModel !== undefined && { llmModel: body.llmModel }),
      ...(body.temperature !== undefined && { temperature: body.temperature }),
      ...(body.maxTokens !== undefined && { maxTokens: body.maxTokens }),
      ...(body.monthlyBudgetUsd !== undefined && { monthlyBudgetUsd: body.monthlyBudgetUsd }),
    },
    update: {
      ...(body.llmModel !== undefined && { llmModel: body.llmModel }),
      ...(body.temperature !== undefined && { temperature: body.temperature }),
      ...(body.maxTokens !== undefined && { maxTokens: body.maxTokens }),
      ...(body.monthlyBudgetUsd !== undefined && { monthlyBudgetUsd: body.monthlyBudgetUsd }),
    },
  });

  return NextResponse.json({ settings: updated });
}
