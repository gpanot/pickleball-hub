"use client";

import Link from "next/link";
import { formatVND } from "@/lib/utils";

interface ClubStatsCardProps {
  club: {
    id: number;
    name: string;
    slug: string;
    numMembers: number;
    avgFillRate: number;
    avgFee: number;
    totalSessionsWeek: number;
    totalJoined: number;
    totalCapacity: number;
  };
}

export function ClubStatsCard({ club }: ClubStatsCardProps) {
  const fillPct = Math.round(club.avgFillRate * 100);

  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="block rounded-xl border border-card-border bg-card p-4 transition hover:shadow-md hover:border-primary/30"
    >
      <h3 className="font-semibold text-sm mb-2 line-clamp-1">{club.name}</h3>
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
