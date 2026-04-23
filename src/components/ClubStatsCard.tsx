"use client";

import Link from "next/link";
import { formatVND } from "@/lib/utils";

interface ClubStatsCardProps {
  club: {
    id: number;
    name: string;
    slug: string;
    numMembers: number;
    zaloUrl?: string | null;
    phone?: string | null;
    avgFillRate: number;
    avgFee: number;
    totalSessionsWeek: number;
    totalJoined: number;
    totalCapacity: number;
  };
}

export function ClubStatsCard({ club }: ClubStatsCardProps) {
  const fillPct = Math.round(club.avgFillRate * 100);
  const hasContact = !!club.zaloUrl || !!club.phone;

  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="block rounded-xl border border-card-border bg-card p-4 transition hover:shadow-md hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm line-clamp-1 min-w-0">{club.name}</h3>
        {hasContact && (
          <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
            {club.zaloUrl ? "Z" : ""}
            {club.phone ? (club.zaloUrl ? " +" : "") + "\u260E" : ""}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted">Members</span>
          <p className="font-bold">{club.numMembers.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-muted">Sessions/week</span>
          <p className="font-bold">{club.totalSessionsWeek}</p>
        </div>
        <div>
          <span className="text-muted">Players today</span>
          <p className="font-bold">
            {club.totalJoined}/{club.totalCapacity}
          </p>
        </div>
        <div>
          <span className="text-muted">Fill rate</span>
          <p className={`font-bold ${fillPct >= 75 ? "text-yellow-500" : "text-green-500"}`}>
            {fillPct}%
          </p>
        </div>
        <div className="col-span-2">
          <span className="text-muted">Avg price</span>
          <p className="font-bold">{formatVND(club.avgFee)}</p>
        </div>
      </div>
    </Link>
  );
}
