"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type VenueOption = {
  id: number;
  name: string;
  address: string;
  _count: { sessions: number };
};

const STORAGE_KEY = "pickleball-hub:selected-venue";

export default function VenueGatePage() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedVenueId(saved);

    fetch("/api/venues")
      .then((r) => r.json())
      .then((d) => {
        const sorted = (d.venues || d || []).sort((a: VenueOption, b: VenueOption) =>
          a.name.localeCompare(b.name)
        );
        setVenues(sorted);
      })
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(val: string) {
    setSelectedVenueId(val);
    if (val) localStorage.setItem(STORAGE_KEY, val);
    else localStorage.removeItem(STORAGE_KEY);
  }

  function handleGo() {
    if (!selectedVenueId) return;
    localStorage.setItem(STORAGE_KEY, selectedVenueId);
    router.push(`/dashboard/venue/${selectedVenueId}`);
  }

  return (
    <div className="mx-auto max-w-lg px-3 py-8 sm:px-4 sm:py-16">
      <div className="rounded-xl border border-card-border bg-card p-4 sm:p-8 text-center">
        <div className="text-4xl mb-4">🏟️</div>
        <h1 className="text-xl font-bold mb-2">Venue Dashboard</h1>
        <p className="text-sm text-muted mb-6">
          Select your venue to view court utilization, hosted clubs, dead hours, rival comparison, and revenue breakdowns.
        </p>

        {loading ? (
          <div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-800 rounded-lg" />
        ) : (
          <div className="space-y-4">
            <select
              value={selectedVenueId}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full rounded-lg border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            >
              <option value="">Select your venue...</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v._count?.sessions ?? 0} sessions)
                </option>
              ))}
            </select>
            <button
              onClick={handleGo}
              disabled={!selectedVenueId}
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
