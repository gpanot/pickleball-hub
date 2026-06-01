import { getHeatmapData } from "@/lib/queries";
import { getSessions } from "@/lib/queries";
import { vnCalendarDateString } from "@/lib/utils";
import { HeatmapClient } from "./HeatmapClient";

export const dynamic = "force-dynamic";

export default async function HeatmapPage() {
  const todayStr = vnCalendarDateString(0);
  const tomorrowStr = vnCalendarDateString(1);

  const t0 = Date.now();
  console.log("[heatmap] page start");

  const [heatmapData, todayData, tomorrowData] = await Promise.all([
    getHeatmapData().then((d) => { console.log(`[heatmap] getHeatmapData done in ${Date.now() - t0}ms, venues=${d.venues.length}`); return d; }),
    getSessions({ date: todayStr }).then((d) => { console.log(`[heatmap] getSessions(today) done in ${Date.now() - t0}ms, sessions=${d.sessions.length}`); return d; }),
    getSessions({ date: tomorrowStr }).then((d) => { console.log(`[heatmap] getSessions(tomorrow) done in ${Date.now() - t0}ms, sessions=${d.sessions.length}`); return d; }),
  ]);

  const allSessions = [
    ...todayData.sessions,
    ...tomorrowData.sessions,
  ];

  const hcmMedian =
    todayData.hcmMedianCostPerHour || tomorrowData.hcmMedianCostPerHour;

  console.log(`[heatmap] page total ${Date.now() - t0}ms`);

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
