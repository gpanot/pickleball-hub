import { getSessions, getSessionsLastScrapedAt } from "@/lib/queries";
import { vnCalendarDateString } from "@/lib/utils";
import { HomeClient } from "@/components/HomeClient";

export const revalidate = false;

function toIsoStringOrNull(d: Date | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : new Date(d as unknown as string).toISOString();
}

export default async function HomePage() {
  const todayStr = vnCalendarDateString(0);
  const tomorrowStr = vnCalendarDateString(1);

  const [todayData, tomorrowData, lastToday, lastTomorrow] = await Promise.all([
    getSessions({ date: todayStr }),
    getSessions({ date: tomorrowStr }),
    getSessionsLastScrapedAt(todayStr),
    getSessionsLastScrapedAt(tomorrowStr),
  ]);

  return (
    <HomeClient
      todayStr={todayStr}
      tomorrowStr={tomorrowStr}
      todaySessions={todayData.sessions}
      tomorrowSessions={tomorrowData.sessions}
      hcmMedianToday={todayData.hcmMedianCostPerHour}
      hcmMedianTomorrow={tomorrowData.hcmMedianCostPerHour}
      lastScrapedAtToday={toIsoStringOrNull(lastToday)}
      lastScrapedAtTomorrow={toIsoStringOrNull(lastTomorrow)}
    />
  );
}
