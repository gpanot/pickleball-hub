export interface SessionInfParams {
  squadMembersCopresent: number;
  isClashActive: boolean;
  isOverlord: boolean;
  cardBattlesWon: number;
  cardPowerPerWin: number;
}

export interface SessionInfResult {
  base: number;
  copresenceBonus: number;
  clashMultiplier: number;
  defenseMultiplier: number;
  cardBonus: number;
  total: number;
}

export function calculateSessionInf(params: SessionInfParams): SessionInfResult {
  const { squadMembersCopresent, isClashActive, isOverlord, cardBattlesWon, cardPowerPerWin } = params;

  const base = 300;
  const extraMembers = Math.min(squadMembersCopresent - 1, 3);
  const copresenceBonus = extraMembers * 150;
  const clashMultiplier = isClashActive ? 2.0 : 1.0;
  const defenseMultiplier = isOverlord ? 1.1 : 1.0;
  const cardBonus = cardBattlesWon * cardPowerPerWin;

  const total = Math.floor(
    (base + copresenceBonus) * clashMultiplier * defenseMultiplier
  ) + cardBonus;

  return { base, copresenceBonus, clashMultiplier, defenseMultiplier, cardBonus, total };
}

export interface CardPowerParams {
  venuesOwned: number;
  squadLevel: number;
  activeMembersThisWeek: number;
}

export function calculateCardPower(params: CardPowerParams): number {
  const { venuesOwned, squadLevel, activeMembersThisWeek } = params;
  const venueBonus = Math.min(venuesOwned, 3) * 50;
  const memberBonus = Math.min(activeMembersThisWeek, 8) * 30;
  const levelMultiplier = 1.0 + squadLevel * 0.05;
  return Math.floor((venueBonus + memberBonus) * levelMultiplier);
}

export function resolveCardBattle(params: {
  initiatingCardPower: number;
  rivalCardPower: number;
  initiatingSquadId: string;
  rivalSquadId: string;
}): string {
  return params.initiatingCardPower >= params.rivalCardPower
    ? params.initiatingSquadId
    : params.rivalSquadId;
}
