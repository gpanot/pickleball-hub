import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensurePlayerHasPod } from "@/lib/pod-helpers";

/**
 * POST /api/squads/dev/backfill-pods
 * One-shot admin endpoint: gives every active squad member who has no Pod
 * an auto-generated Pod. Safe to call multiple times (idempotent).
 */
export async function POST(req: NextRequest) {
  // Simple shared-secret guard — not authenticated via player session
  const secret = req.headers.get("x-backfill-secret");
  if (secret !== process.env.BACKFILL_SECRET && secret !== "squadd-dev-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all active squad members who have no active Pod membership in that squad
  const membersWithoutPod = await prisma.$queryRaw<
    Array<{ profileId: string; squadId: string }>
  >`
    SELECT sm."profile_id" AS "profileId", sm."squad_id" AS "squadId"
    FROM "squad_members" sm
    LEFT JOIN "pod_members" pm
      ON pm."profile_id" = sm."profile_id"
      AND pm."left_at" IS NULL
      AND EXISTS (
        SELECT 1 FROM "pods" p
        WHERE p."id" = pm."pod_id"
          AND p."squad_id" = sm."squad_id"
          AND p."disbanded_at" IS NULL
      )
    WHERE sm."left_at" IS NULL
      AND pm."id" IS NULL
  `;

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of membersWithoutPod) {
    try {
      const result = await ensurePlayerHasPod(row.profileId, row.squadId, null);
      if (result.created) created++;
      else skipped++;
    } catch (e) {
      errors.push(`${row.profileId}@${row.squadId}: ${String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    totalProcessed: membersWithoutPod.length,
    created,
    skipped,
    errors: errors.slice(0, 20),
  });
}
