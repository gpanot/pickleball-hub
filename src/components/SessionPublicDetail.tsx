"use client";

import { useCallback, useMemo, useState } from "react";
import { FillRateBar } from "@/components/FillRateBar";
import { SessionDetailBackButton } from "@/components/SessionDetailBackButton";
import { SessionScoreAndDuprBadges, SessionScoreBreakdownPanel } from "@/components/SessionScoreBadge";
import { mouseflowTag } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n";
import { buildSessionShareText } from "@/lib/share-session-text";
import type { PublicSessionByReference } from "@/lib/queries";
import { computeCostPerHour, formatCalendarDayLabel, formatVND, parseSessionType } from "@/lib/utils";
import type { SessionScoreInput } from "@/lib/scoring";

function reclubMeetUrl(referenceCode: string): string {
  return `https://reclub.co/m/${referenceCode}`;
}

export function SessionPublicDetail({
  session,
  hcmMedianCostPerHour,
}: {
  session: PublicSessionByReference;
  hcmMedianCostPerHour: number;
}) {
  const { t, locale } = useI18n();
  const [shareToast, setShareToast] = useState(false);

  const scoreInput: SessionScoreInput = useMemo(() => {
    const sessionType = parseSessionType(session.name);
    return {
      confirmedPlayers: session.joined,
      capacity: session.maxPlayers,
      priceVnd: session.feeAmount,
      durationMinutes: session.durationMin,
      hasZalo: Boolean(session.club.zaloUrl),
      hcmMedianCostPerHour,
      sessionType,
      duprParticipationPct: session.duprParticipationPct,
      returningPlayerPct: session.returningPlayerPct,
    };
  }, [session, hcmMedianCostPerHour]);

  const costPerHourDisplay =
    session.costPerHour != null && session.costPerHour > 0
      ? session.costPerHour
      : computeCostPerHour(session.feeAmount, session.durationMin);

  const dayLabel = formatCalendarDayLabel(session.scrapedDate, locale === "vi" ? "vi-VN" : "en-US");

  const shareText = buildSessionShareText(
    {
      name: session.name,
      venue: session.venue,
      club: session.club,
      startTime: session.startTime,
      endTime: session.endTime,
      feeAmount: session.feeAmount,
      referenceCode: session.referenceCode,
      costPerHour: session.costPerHour,
      durationMin: session.durationMin,
    },
    scoreInput,
    t,
  );

  const handleShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 2500);
    }
  }, [shareText]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:py-8">
      <SessionDetailBackButton />

      <h1 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">{session.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {session.club.name}
        {session.venue?.name ? ` · ${session.venue.name}` : ""}
      </p>
      <p className="mt-2 text-sm text-foreground">
        {dayLabel} · {session.startTime} – {session.endTime} · {session.durationMin} {t("minutesShort")}
      </p>

      <div className="mt-4">
        <SessionScoreAndDuprBadges input={scoreInput} />
      </div>

      <div className="mt-4">
        <FillRateBar joined={session.joined} maxPlayers={session.maxPlayers} waitlisted={session.waitlisted} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-lg font-bold tabular-nums">{formatVND(session.feeAmount)}</span>
        {costPerHourDisplay > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">{formatVND(costPerHourDisplay)}/hr</span>
        )}
      </div>

      <div className="mt-5 border-t border-card-border pt-4">
        <SessionScoreBreakdownPanel input={scoreInput} />
      </div>

      {session.venue ? (
        <div className="mt-5 text-sm">
          <p className="font-medium text-foreground">{session.venue.name}</p>
          <p className="mt-1 text-muted-foreground">{session.venue.address}</p>
        </div>
      ) : null}

      <div className="my-6 h-px w-full bg-card-border" aria-hidden />

      <div className="flex flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <a
          href={reclubMeetUrl(session.referenceCode)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => mouseflowTag("converted:reclub_click")}
          className="box-border flex min-h-[48px] w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-primary-dark"
        >
          {t("bookOnReclubCta")}
        </a>
        <button
          type="button"
          onClick={() => void handleShare()}
          className="box-border flex min-h-[48px] w-full items-center justify-center rounded-lg border-2 border-primary bg-transparent px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/5"
        >
          {t("shareThisSession")}
        </button>
      </div>

      {shareToast && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-[110] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl">
          {t("shareClipboardToast")}
        </div>
      )}
    </div>
  );
}
