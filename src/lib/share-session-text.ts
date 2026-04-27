import { computeSessionScore, getScoreLabel, type DuprBadge, type SessionScoreInput } from "@/lib/scoring";
import { scoreRatingTranslationKey } from "@/lib/score-translations";
import type { TranslationKey } from "@/lib/i18n";
import { computeCostPerHour, formatVND } from "@/lib/utils";
import { HUB_SITE_ORIGIN } from "@/lib/site";

export function buildSessionDeepLink(referenceCode: string): string {
  return `${HUB_SITE_ORIGIN}/sessions/${encodeURIComponent(referenceCode)}`;
}

function duprTierLabelForShare(
  badge: DuprBadge,
  t: (k: TranslationKey) => string,
): string {
  switch (badge) {
    case "competitive":
      return t("scoreDuprTierCompetitive");
    case "mixed":
      return t("scoreDuprTierMixed");
    case "casual":
      return t("scoreDuprTierCasual");
  }
}

export function buildSessionShareText(
  session: {
    name: string;
    venue: { name: string } | null;
    club: { name: string };
    startTime: string;
    endTime: string;
    feeAmount: number;
    referenceCode: string;
    costPerHour: number | null;
    durationMin: number;
  },
  scoreInput: SessionScoreInput,
  t: (k: TranslationKey) => string,
): string {
  const formatTime = (time: string) => time.trim();
  const formatPrice = formatVND;
  const result = computeSessionScore(scoreInput);
  const { ratingTier } = getScoreLabel(result.score);
  const scoreLabel = t(scoreRatingTranslationKey(ratingTier));
  const costPerHour =
    session.costPerHour != null && session.costPerHour > 0
      ? session.costPerHour
      : computeCostPerHour(session.feeAmount, session.durationMin);
  const duprLabel =
    result.duprPercent != null && result.duprBadge
      ? duprTierLabelForShare(result.duprBadge, t)
      : "";
  const starLine =
    result.duprPercent != null && result.duprBadge
      ? `★ ${result.score} ${scoreLabel} · ${result.duprPercent}% DUPR · ${duprLabel}`
      : `★ ${result.score} ${scoreLabel}`;

  return [
    `🎾 ${session.name}`,
    `📍 ${session.venue?.name ?? session.club.name}`,
    `⏱ ${formatTime(session.startTime)}-${formatTime(session.endTime)} · ${formatPrice(session.feeAmount)} · ${formatPrice(costPerHour)}/hr`,
    starLine,
    `👉 ${buildSessionDeepLink(session.referenceCode)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
