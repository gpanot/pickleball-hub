import { getHeatmapData } from "@/lib/queries";
import { getSessions } from "@/lib/queries";
import { vnCalendarDateString } from "@/lib/utils";
import { HeatmapClient } from "./HeatmapClient";

export const dynamic = "force-dynamic";

export default async function HeatmapPage() {
  const todayStr = vnCalendarDateString(0);
  const tomorrowStr = vnCalendarDateString(1);

  const t0 = Date.now();
  console.log("[heatmap] page start — todayStr=%s tomorrowStr=%s", todayStr, tomorrowStr);

  // ── Heatmap data ────────────────────────────────────────────────────────────
  let heatmapData: Awaited<ReturnType<typeof getHeatmapData>>;
  try {
    heatmapData = await getHeatmapData();
    console.log(`[heatmap] getHeatmapData OK — ${Date.now() - t0}ms, venues=${heatmapData.venues.length}`);
  } catch (err) {
    console.error("[heatmap] getHeatmapData FAILED", {
      message: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string }).code,
      meta: (err as { meta?: unknown }).meta,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err; // re-throw → caught by error.tsx boundary
  }

  // ── Session data ─────────────────────────────────────────────────────────────
  let todayData: Awaited<ReturnType<typeof getSessions>>;
  let tomorrowData: Awaited<ReturnType<typeof getSessions>>;
  try {
    [todayData, tomorrowData] = await Promise.all([
      getSessions({ date: todayStr }),
      getSessions({ date: tomorrowStr }),
    ]);
    console.log(
      `[heatmap] getSessions OK — ${Date.now() - t0}ms, today=${todayData.sessions.length} tomorrow=${tomorrowData.sessions.length}`,
    );
  } catch (err) {
    console.error("[heatmap] getSessions FAILED", {
      message: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string }).code,
      meta: (err as { meta?: unknown }).meta,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  const allSessions = [
    ...todayData.sessions,
    ...tomorrowData.sessions,
  ];

  const hcmMedian =
    todayData.hcmMedianCostPerHour || tomorrowData.hcmMedianCostPerHour;

  console.log(`[heatmap] page render — total=${Date.now() - t0}ms sessions=${allSessions.length} hcmMedian=${hcmMedian}`);

  return (
    <HeatmapClient
      heatmapData={heatmapData}
      sessions={allSessions}
      hcmMedianCostPerHour={hcmMedian}
      todayStr={todayStr}
      // showAiChat is now fetched client-side so page can stay ISR-cached
    />
  );
}
