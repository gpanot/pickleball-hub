import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Great-circle distance in kilometers (WGS84 approximate). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function parseFeeString(fee: string): number {
  if (!fee || fee.toLowerCase() === "free") return 0;
  const cleaned = fee.replace(/[^\d]/g, "");
  return parseInt(cleaned, 10) || 0;
}

export function formatVND(amount: number): string {
  if (amount === 0) return "Free";
  return `${amount.toLocaleString("vi-VN")}đ`;
}

export function computeCostPerHour(feeAmount: number, durationMin: number): number {
  if (durationMin <= 0 || feeAmount <= 0) return 0;
  return Math.round(feeAmount / (durationMin / 60));
}

export function computeFillRate(joined: number, maxPlayers: number): number {
  if (maxPlayers <= 0) return 0;
  return Math.min(joined / maxPlayers, 1.5);
}

export function fillRateColor(rate: number): string {
  if (rate >= 1) return "text-red-500";
  if (rate >= 0.75) return "text-yellow-500";
  return "text-green-500";
}

export function fillRateBgColor(rate: number): string {
  if (rate >= 1) return "bg-red-500";
  if (rate >= 0.75) return "bg-yellow-500";
  return "bg-green-500";
}

export function fillRateLabel(rate: number): string {
  if (rate >= 1.0) return "Full";
  if (rate >= 0.75) return "Filling";
  return "Available";
}

export function timeSlot(startTime: string): "morning" | "afternoon" | "evening" {
  const hour = parseInt(startTime.split(":")[0], 10);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function parseSkillLevel(name: string): { min: number | null; max: number | null } {
  const rangeMatch = name.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\+?/);
  if (rangeMatch) {
    return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
  }

  const singleMatch = name.match(/(\d+\.?\d*)\+/);
  if (singleMatch) {
    return { min: parseFloat(singleMatch[1]), max: null };
  }

  if (/newbie/i.test(name)) {
    return { min: 1.0, max: 2.5 };
  }

  if (/all\s*level/i.test(name)) {
    return { min: 1.0, max: null };
  }

  return { min: null, max: null };
}

export function parsePerks(name: string): string[] {
  const perks: string[] = [];
  const lower = name.toLowerCase();

  if (/free\s*(chuối|banana)/i.test(name) || /tặng.*chuối/i.test(name)) perks.push("banana");
  if (/free\s*(trứng|egg)/i.test(name) || /tặng.*trứng/i.test(name)) perks.push("egg");
  if (/free\s*(nước|drink|water)/i.test(name) || /tặng.*nước/i.test(name)) perks.push("drink");
  if (/free\s*(cafe|coffee|cà phê)/i.test(name)) perks.push("coffee");
  if (/free\s*(trái cây|fruit)/i.test(name)) perks.push("fruit");
  if (/free\s*(sữa|milk)/i.test(name)) perks.push("milk");
  if (/free\s*(bánh)/i.test(name)) perks.push("snack");
  if (lower.includes("drill") || lower.includes("clinic")) perks.push("coaching");
  if (/round\s*robin/i.test(name) || /dupr/i.test(name)) perks.push("tournament");

  return [...new Set(perks)];
}

export type SessionType = "social" | "drills" | "roundrobin";

export function parseSessionType(name: string): SessionType {
  if (/round\s*robin/i.test(name)) return "roundrobin";
  if (/drill|clinic|training/i.test(name)) return "drills";
  return "social";
}

const FOOD_DRINK_PERKS = new Set(["banana", "egg", "drink", "coffee", "fruit", "milk", "snack"]);

export function hasFoodDrinkPerk(perks: string[]): boolean {
  return perks.some((p) => FOOD_DRINK_PERKS.has(p));
}

export function perkEmoji(perk: string): string {
  const map: Record<string, string> = {
    banana: "🍌",
    egg: "🥚",
    drink: "🥤",
    coffee: "☕",
    fruit: "🍎",
    milk: "🥛",
    snack: "🍪",
    coaching: "🎯",
    tournament: "🏆",
  };
  return map[perk] || "✨";
}
