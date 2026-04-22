"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type ClubOption = {
  id: number;
  name: string;
  slug: string;
  numMembers: number;
  totalSessionsWeek: number;
};

const STORAGE_KEY = "pickleball-hub:selected-club";

export default function OrganizerGatePage() {
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedClubId(saved);

    fetch("/api/clubs")
      .then((r) => r.json())
      .then((d) => {
        const sorted = (d.clubs || []).sort((a: ClubOption, b: ClubOption) =>
          a.name.localeCompare(b.name)
        );
        setClubs(sorted);
      })
      .catch(() => setClubs([]))
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(val: string) {
    setSelectedClubId(val);
    if (val) localStorage.setItem(STORAGE_KEY, val);
    else localStorage.removeItem(STORAGE_KEY);
  }

  function handleGo() {
    if (!selectedClubId) return;
    localStorage.setItem(STORAGE_KEY, selectedClubId);
    router.push(`/dashboard/organizer/${selectedClubId}`);
  }

  return (
    <div className="mx-auto max-w-lg px-3 py-8 sm:px-4 sm:py-16">
      <div className="rounded-xl border border-card-border bg-card p-4 sm:p-8 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h1 className="text-xl font-bold mb-2">Organizer Dashboard</h1>
        <p className="text-sm text-muted mb-6">
          Select your club to view analytics, competitive analysis, rival comparison, and revenue estimates.
        </p>

        {loading ? (
          <div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-800 rounded-lg" />
        ) : (
          <div className="space-y-4">
            <select
              value={selectedClubId}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full rounded-lg border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            >
              <option value="">Select your club...</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.numMembers} members, {c.totalSessionsWeek} sessions/wk)
                </option>
              ))}
            </select>
            <button
              onClick={handleGo}
              disabled={!selectedClubId}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark transition disabled:opacity-50"
            >
              Open Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
