"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  SELECTED_VENUE_KEY,
  setVenueUnlocked,
  isVenueUnlocked,
  clearVenueSession,
} from "@/lib/dashboard-session";

type VenueOption = {
  id: number;
  name: string;
  address: string;
  _count: { sessions: number };
};

export default function VenueGatePage() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setUnlocked(isVenueUnlocked());
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const saved = localStorage.getItem(SELECTED_VENUE_KEY);
    if (saved) setSelectedVenueId(saved);
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) {
      setLoading(false);
      return;
    }
    fetch("/api/venues")
      .then((r) => r.json())
      .then((d) => {
        const sorted = (d.venues || d || []).sort((a: VenueOption, b: VenueOption) =>
          a.name.localeCompare(b.name),
        );
        setVenues(sorted);
      })
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, [unlocked]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError("");
    const code = accessCode.trim();
    if (!code) {
      setVerifyError("Enter your access code.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/dashboard/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || "Invalid or expired code");
        return;
      }
      if (data.entityType !== "venue" || data.venueId == null) {
        setVerifyError("This code is not valid for venue access.");
        return;
      }
      setVenueUnlocked();
      setUnlocked(true);
      setSelectedVenueId(String(data.venueId));
      localStorage.setItem(SELECTED_VENUE_KEY, String(data.venueId));
      setAccessCode("");
    } catch {
      setVerifyError("Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  }

  function handleSelect(val: string) {
    setSelectedVenueId(val);
    if (val) localStorage.setItem(SELECTED_VENUE_KEY, val);
    else localStorage.removeItem(SELECTED_VENUE_KEY);
  }

  function handleGo() {
    if (!selectedVenueId) return;
    localStorage.setItem(SELECTED_VENUE_KEY, selectedVenueId);
    router.push(`/dashboard/venue/${selectedVenueId}`);
  }

  function handleLogout() {
    clearVenueSession();
    setUnlocked(false);
    setSelectedVenueId("");
    setVenues([]);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-lg px-3 py-8 sm:px-4 sm:py-16">
      <div className="rounded-xl border border-card-border bg-card p-4 sm:p-8 text-center">
        <div className="text-4xl mb-4">🏟️</div>
        <h1 className="text-xl font-bold mb-2">Venue Dashboard</h1>
        <p className="text-sm text-muted mb-6">
          Enter your venue access code, then select your venue for utilization, hosted clubs, and revenue
          breakdowns.
        </p>

        {!unlocked ? (
          <form onSubmit={handleVerify} className="space-y-4 text-left">
            <div>
              <label htmlFor="venue-code" className="block text-xs font-medium text-muted mb-1">
                Access code
              </label>
              <input
                id="venue-code"
                type="text"
                autoComplete="off"
                placeholder="e.g. DEMO-VEN-001"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full rounded-lg border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-muted">
                Demo: use <span className="font-mono text-foreground">DEMO-VEN-001</span> after seeding the database.
              </p>
            </div>
            {verifyError ? <p className="text-sm text-red-600 dark:text-red-400">{verifyError}</p> : null}
            <button
              type="submit"
              disabled={verifying}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark transition disabled:opacity-50"
            >
              {verifying ? "Verifying…" : "Unlock dashboard"}
            </button>
          </form>
        ) : loading ? (
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
              type="button"
              onClick={handleGo}
              disabled={!selectedVenueId}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark transition disabled:opacity-50"
            >
              Open Dashboard
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-lg border border-card-border bg-background py-3 text-sm font-semibold text-muted hover:text-foreground hover:border-primary/40 transition"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
