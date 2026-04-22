"use client";

import { useState, useCallback, useEffect } from "react";

export interface FilterState {
  timeSlot: string;
  maxPrice: string;
  availability: string;
  foodDrink: string;
  sessionType: string;
  search: string;
  sortBy: string;
}

interface SessionFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  sessionCount: number;
  hasUserLocation?: boolean;
}

function AdvancedFilters({
  filters,
  update,
}: {
  filters: FilterState;
  update: (key: keyof FilterState, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">Time</label>
        <select
          value={filters.timeSlot}
          onChange={(e) => update("timeSlot", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">All day</option>
          <option value="morning">Morning (&lt;12h)</option>
          <option value="afternoon">Afternoon (12-17h)</option>
          <option value="evening">Evening (&gt;17h)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">Max Price</label>
        <select
          value={filters.maxPrice}
          onChange={(e) => update("maxPrice", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">Any price</option>
          <option value="0">Free only</option>
          <option value="50000">Under 50k</option>
          <option value="80000">Under 80k</option>
          <option value="100000">Under 100k</option>
          <option value="120000">Under 120k</option>
          <option value="150000">Under 150k</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">Session Type</label>
        <select
          value={filters.sessionType}
          onChange={(e) => update("sessionType", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">All types</option>
          <option value="social">Social</option>
          <option value="drills">Drills / Clinic</option>
          <option value="roundrobin">Round Robin</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">Availability</label>
        <select
          value={filters.availability}
          onChange={(e) => update("availability", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">Any</option>
          <option value="available">Available</option>
          <option value="filling">Filling up</option>
          <option value="full">Full</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">Sort</label>
        <select
          value={filters.sortBy}
          onChange={(e) => update("sortBy", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="time">Start time</option>
          <option value="nearby">Nearest first</option>
          <option value="price">Price (low first)</option>
          <option value="costPerHour">Cost/hour</option>
          <option value="fillRate">Fill rate</option>
          <option value="available">Most available</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">Food & Drink</label>
        <select
          value={filters.foodDrink}
          onChange={(e) => update("foodDrink", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">Any</option>
          <option value="true">Has food/drink</option>
        </select>
      </div>
    </div>
  );
}

export function SessionFilters({
  filters,
  onChange,
  sessionCount,
  hasUserLocation = false,
}: SessionFiltersProps) {
  const [search, setSearch] = useState(filters.search);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  const update = useCallback(
    (key: keyof FilterState, value: string) => {
      onChange({ ...filters, [key]: value });
    },
    [filters, onChange],
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update("search", search);
  };

  const pillClass = (active: boolean) =>
    `inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
      active
        ? "border-primary bg-primary text-white"
        : "border-card-border bg-background hover:border-primary/40"
    }`;

  const toggleFree = () => {
    update("maxPrice", filters.maxPrice === "0" ? "" : "0");
  };

  const toggleFilling = () => {
    update("availability", filters.availability === "filling" ? "" : "filling");
  };

  const toggleSocial = () => {
    update("sessionType", filters.sessionType === "social" ? "" : "social");
  };

  const toggleNearby = () => {
    if (!hasUserLocation) return;
    update("sortBy", filters.sortBy === "nearby" ? "time" : "nearby");
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Desktop search */}
      <form onSubmit={handleSearchSubmit} className="hidden gap-2 sm:flex">
        <input
          type="text"
          placeholder="Sessions, clubs, addresses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="min-h-[44px] shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
        >
          Search
        </button>
      </form>

      {/* Quick pills — mobile: single scrollable row (incl. Filters) */}
      <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={toggleFree} className={pillClass(filters.maxPrice === "0")}>
          Free
        </button>
        <button
          type="button"
          onClick={toggleFilling}
          title="Filling up"
          className={pillClass(filters.availability === "filling")}
        >
          Filling
        </button>
        <button type="button" onClick={toggleSocial} className={pillClass(filters.sessionType === "social")}>
          Social
        </button>
        <button
          type="button"
          onClick={toggleNearby}
          disabled={!hasUserLocation}
          title={hasUserLocation ? "Nearby" : "Allow location to use Nearby"}
          className={`${pillClass(filters.sortBy === "nearby")} ${!hasUserLocation ? "cursor-not-allowed opacity-40" : ""}`}
        >
          Nearby
        </button>
        <button
          type="button"
          onClick={() => setMoreFiltersOpen((o) => !o)}
          className={`${pillClass(moreFiltersOpen)} gap-1 pr-2.5`}
          aria-expanded={moreFiltersOpen}
          title="More filters"
        >
          <span>Filters</span>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`h-3 w-3 shrink-0 opacity-80 transition-transform duration-200 ${moreFiltersOpen ? "-rotate-180" : ""}`}
            aria-hidden
          >
            <path d="M7 10l5 5 5-5H7z" />
          </svg>
        </button>
      </div>

      {/* Mobile: expanded advanced filters */}
      {moreFiltersOpen ? (
        <div className="mt-3 border-t border-card-border pt-3 sm:hidden">
          <AdvancedFilters filters={filters} update={update} />
        </div>
      ) : null}

      {/* Desktop: filters always visible */}
      <div className="hidden sm:block">
        <AdvancedFilters filters={filters} update={update} />
      </div>

      <p className="text-xs text-muted">
        {sessionCount} session{sessionCount !== 1 ? "s" : ""} found
      </p>
    </div>
  );
}
