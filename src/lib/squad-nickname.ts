export const SQUAD_NICKNAME_MIN = 3;
export const SQUAD_NICKNAME_MAX = 20;

function graphemeSegments(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [
      ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    ].map((part) => part.segment);
  }
  return [...text];
}

function graphemeLength(text: string): number {
  return graphemeSegments(text).length;
}

function isAllowedNicknameSegment(segment: string): boolean {
  if (/^[a-zA-Z0-9_]+$/.test(segment)) return true;
  return /\p{Extended_Pictographic}/u.test(segment);
}

export function normalizeSquadNickname(raw: string): string {
  const kept: string[] = [];
  for (const segment of graphemeSegments(raw.trim())) {
    if (!isAllowedNicknameSegment(segment)) continue;
    kept.push(/^[a-zA-Z0-9_]+$/.test(segment) ? segment.toLowerCase() : segment);
    if (kept.length >= SQUAD_NICKNAME_MAX) break;
  }
  return kept.join("");
}

export function validateSquadNickname(raw: string): string | null {
  const nickname = normalizeSquadNickname(raw);
  const len = graphemeLength(nickname);
  if (len < SQUAD_NICKNAME_MIN) return `At least ${SQUAD_NICKNAME_MIN} characters`;
  if (len > SQUAD_NICKNAME_MAX) return `Max ${SQUAD_NICKNAME_MAX} characters`;
  for (const segment of graphemeSegments(nickname)) {
    if (!isAllowedNicknameSegment(segment)) {
      return "Letters, numbers, underscores and emoji only";
    }
  }
  return null;
}
