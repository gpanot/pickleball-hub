import { getHeatmapData } from "@/lib/queries";
import { getSessions } from "@/lib/queries";
import { vnCalendarDateString } from "@/lib/utils";
import { HeatmapClient } from "./HeatmapClient";

// ISR: rely on on-demand revalidation from scraper (POST /api/revalidate).
// Long interval avoids unnecessary ISR writes between scrapes.
export const revalidate = false;

export default async function HeatmapPage() {
  const todayStr = vnCalendarDateString(0);
  const tomorrowStr = vnCalendarDateString(1);

  const [heatmapData, todayData, tomorrowData] = await Promise.all([
    getHeatmapData(),
    getSessions({ date: todayStr }),
    getSessions({ date: tomorrowStr }),
  ]);

  const allSessions = [
    ...todayData.sessions,
    ...tomorrowData.sessions,
  ];

  const hcmMedian =
    todayData.hcmMedianCostPerHour || tomorrowData.hcmMedianCostPerHour;

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
