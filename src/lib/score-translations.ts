import type { TranslationKey } from "./i18n";
import type { DuprBadge, ScoreRatingTier } from "./scoring";

export function scoreRatingTranslationKey(tier: ScoreRatingTier): TranslationKey {
  switch (tier) {
    case "excellent":
      return "scoreRatingExcellent";
    case "good":
      return "scoreRatingGood";
    case "average":
      return "scoreRatingAverage";
    case "belowAvg":
      return "scoreRatingBelowAvg";
  }
}

export function duprPillTranslationKey(badge: DuprBadge): TranslationKey {
  switch (badge) {
    case "competitive":
      return "scoreDuprPillCompetitive";
    case "mixed":
      return "scoreDuprPillMixed";
    case "casual":
      return "scoreDuprPillCasual";
  }
}
