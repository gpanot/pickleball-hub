import { getHeatmapData } from "@/lib/queries";
import { getSessions } from "@/lib/queries";
import { vnCalendarDateString } from "@/lib/utils";
import { HeatmapClient } from "./HeatmapClient";

// Revalidate at most once per hour (same as API route)
export const revalidate = 3600;

export default async function HeatmapPage() {
  const todayStr = vnCalendarDateString(0);
  const tomorrowStr = vnCalendarDateString(1);

  const [heatmapData, todayData, tomorrowData] = await Promise.all([
    getHeatmapData(),
    getSessions({ date: todayStr }),
    getSessions({ date: tomorrowStr }),
  ]);

  // Combine today + tomorrow sessions for the recommendations strip
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
    />
  );
}
