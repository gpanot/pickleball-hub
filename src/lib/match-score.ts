export function calculateMatchScore(params: {
  userDupr: number | null;
  sessionAvgDupr: number | null;
  distanceKm: number | null;
  fillRate: number;
  joinedRecently: number;
  fillingFast: boolean;
  returningPlayerPct: number | null;
  friendCount: number;
}): number {
  const {
    userDupr,
    sessionAvgDupr,
    distanceKm,
    fillRate,
    joinedRecently,
    fillingFast,
    returningPlayerPct,
    friendCount,
  } = params;

  let dupr = 20;
  if (userDupr && sessionAvgDupr) {
    const diff = Math.abs(userDupr - sessionAvgDupr);
    if (diff <= 0.2) dupr = 40;
    else if (diff <= 0.4) dupr = 32;
    else if (diff <= 0.6) dupr = 22;
    else if (diff <= 1.0) dupr = 10;
    else dupr = 0;
  }

  let dist = 12;
  if (distanceKm !== null) {
    if (distanceKm <= 1.5) dist = 25;
    else if (distanceKm <= 3.0) dist = 20;
    else if (distanceKm <= 5.0) dist = 14;
    else dist = 0;
  }

  let momentum = 2;
  if (fillingFast) momentum = 20;
  else if (joinedRecently >= 2) momentum = 15;
  else if (fillRate >= 0.5) momentum = 10;
  else if (fillRate >= 0.3) momentum = 6;

  let community = 5;
  if (returningPlayerPct !== null) {
    if (returningPlayerPct >= 0.7) community = 10;
    else if (returningPlayerPct >= 0.5) community = 7;
    else if (returningPlayerPct >= 0.3) community = 4;
    else community = 2;
  }

  const friends = friendCount >= 3 ? 5 : friendCount >= 1 ? 3 : 0;

  return Math.min(100, dupr + dist + momentum + community + friends);
}
