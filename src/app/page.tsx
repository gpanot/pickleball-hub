import { getSessions, getSessionsLastScrapedAt } from "@/lib/queries";
import { vnCalendarDateString } from "@/lib/utils";
import { HomeClient } from "@/components/HomeClient";

// ISR: rebuild at most once per hour so hero stats stay fresh without a full redeploy
export const revalidate = 3600;

function toIsoStringOrNull(d: Date | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : new Date(d as unknown as string).toISOString();
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Inline server-rendered hero stats — present in the initial HTML response
 * so Lighthouse/PageSpeed sees it as the LCP element without any JS delay.
 * HomeClient hides its own duplicate header on desktop via a CSS class.
 */
function HeroStats({
  todayStr,
  sessionCount,
  totalPlayers,
  lastScrapedAt,
}: {
  todayStr: string;
  sessionCount: number;
  totalPlayers: number;
  lastScrapedAt: string | null;
}) {
  const updatedAt = lastScrapedAt
    ? new Date(lastScrapedAt).toLocaleString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-2 pt-4 sm:px-6 lg:px-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="mb-1 hidden text-xl font-bold sm:block sm:text-2xl">
          <span className="text-primary">Pickleball</span>{" "}
          Sessions Today
        </h1>
        <p className="text-sm text-muted" id="hero-stats">
          Ho Chi Minh City — {formatDayLabel(todayStr)}
          {" "}— {sessionCount} buổi chơi, {totalPlayers.toLocaleString()} người chơi
          {updatedAt && (
            <>
              <span className="sm:hidden"> - </span>
              <span className="text-[11px] text-muted/70 sm:hidden">
                Cập nhật lúc {updatedAt}
              </span>
            </>
          )}
        </p>
        {updatedAt && (
          <p className="mt-0.5 hidden text-[11px] text-muted/70 sm:block">
            Cập nhật lúc {updatedAt}
          </p>
        )}
      </div>
    </div>
  );
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

  const totalPlayers = todayData.sessions.reduce((sum, s) => sum + s.joined, 0);

  return (
    <>
      {/* LCP element: server-rendered hero stats present in initial HTML */}
      <HeroStats
        todayStr={todayStr}
        sessionCount={todayData.sessions.length}
        totalPlayers={totalPlayers}
        lastScrapedAt={toIsoStringOrNull(lastToday)}
      />
      <HomeClient
        todayStr={todayStr}
        tomorrowStr={tomorrowStr}
        todaySessions={todayData.sessions}
        tomorrowSessions={tomorrowData.sessions}
        hcmMedianToday={todayData.hcmMedianCostPerHour}
        hcmMedianTomorrow={tomorrowData.hcmMedianCostPerHour}
        lastScrapedAtToday={toIsoStringOrNull(lastToday)}
        lastScrapedAtTomorrow={toIsoStringOrNull(lastTomorrow)}
        serverHeroRendered
      />
    </>
  );
}
