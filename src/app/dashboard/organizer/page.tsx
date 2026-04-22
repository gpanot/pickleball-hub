"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  SELECTED_CLUB_KEY,
  setOrganizerUnlocked,
  isOrganizerUnlocked,
  clearOrganizerSession,
} from "@/lib/dashboard-session";

type ClubOption = {
  id: number;
  name: string;
  slug: string;
  numMembers: number;
  totalSessionsWeek: number;
};

export default function OrganizerGatePage() {
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setUnlocked(isOrganizerUnlocked());
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const saved = localStorage.getItem(SELECTED_CLUB_KEY);
    if (saved) setSelectedClubId(saved);
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) {
      setLoading(false);
      return;
    }
    fetch("/api/clubs")
      .then((r) => r.json())
      .then((d) => {
        const sorted = (d.clubs || []).sort((a: ClubOption, b: ClubOption) =>
          a.name.localeCompare(b.name),
        );
        setClubs(sorted);
      })
      .catch(() => setClubs([]))
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
      if (data.entityType !== "club" || data.clubId == null) {
        setVerifyError("This code is not valid for organizer access.");
        return;
      }
      setOrganizerUnlocked();
      setUnlocked(true);
      setSelectedClubId(String(data.clubId));
      localStorage.setItem(SELECTED_CLUB_KEY, String(data.clubId));
      setAccessCode("");
    } catch {
      setVerifyError("Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  }

  function handleSelect(val: string) {
    setSelectedClubId(val);
    if (val) localStorage.setItem(SELECTED_CLUB_KEY, val);
    else localStorage.removeItem(SELECTED_CLUB_KEY);
  }

  function handleGo() {
    if (!selectedClubId) return;
    localStorage.setItem(SELECTED_CLUB_KEY, selectedClubId);
    router.push(`/dashboard/organizer/${selectedClubId}`);
  }

  function handleLogout() {
    clearOrganizerSession();
    setUnlocked(false);
    setSelectedClubId("");
    setClubs([]);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-lg px-3 py-8 sm:px-4 sm:py-16">
      <div className="rounded-xl border border-card-border bg-card p-4 sm:p-8 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h1 className="text-xl font-bold mb-2">Organizer Dashboard</h1>
        <p className="text-sm text-muted mb-6">
          Enter your organizer access code, then select your club to view analytics, rival comparison,
          and revenue estimates.
        </p>

        {!unlocked ? (
          <form onSubmit={handleVerify} className="space-y-4 text-left">
            <div>
              <label htmlFor="org-code" className="block text-xs font-medium text-muted mb-1">
                Access code
              </label>
              <input
                id="org-code"
                type="text"
                autoComplete="off"
                placeholder="Your access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full rounded-lg border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
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
              type="button"
              onClick={handleGo}
              disabled={!selectedClubId}
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
