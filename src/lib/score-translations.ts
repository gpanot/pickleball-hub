import type { TranslationKey } from "./i18n";
import type { ScoreRatingTier } from "./scoring";

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
