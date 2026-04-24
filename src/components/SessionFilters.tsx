"use client";

import { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { clarityTag } from "@/lib/analytics";

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
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">{t("time")}</label>
        <select
          value={filters.timeSlot}
          onChange={(e) => update("timeSlot", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">{t("allDay")}</option>
          <option value="morning">{t("morning")}</option>
          <option value="afternoon">{t("afternoon")}</option>
          <option value="evening">{t("evening")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">{t("maxPrice")}</label>
        <select
          value={filters.maxPrice}
          onChange={(e) => update("maxPrice", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">{t("anyPrice")}</option>
          <option value="0">{t("freeOnly")}</option>
          <option value="50000">{t("under")} 50k</option>
          <option value="80000">{t("under")} 80k</option>
          <option value="100000">{t("under")} 100k</option>
          <option value="120000">{t("under")} 120k</option>
          <option value="150000">{t("under")} 150k</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">{t("sessionType")}</label>
        <select
          value={filters.sessionType}
          onChange={(e) => update("sessionType", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">{t("allTypes")}</option>
          <option value="social">{t("social")}</option>
          <option value="drills">{t("drillsClinic")}</option>
          <option value="roundrobin">{t("roundRobin")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">{t("availability")}</label>
        <select
          value={filters.availability}
          onChange={(e) => update("availability", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">{t("any")}</option>
          <option value="available">{t("available")}</option>
          <option value="filling">{t("fillingUp")}</option>
          <option value="full">{t("full")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">{t("sort")}</label>
        <select
          value={filters.sortBy}
          onChange={(e) => update("sortBy", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="time">{t("startTime")}</option>
          <option value="nearby">{t("nearestFirst")}</option>
          <option value="price">{t("priceLowFirst")}</option>
          <option value="costPerHour">{t("costPerHour")}</option>
          <option value="fillRate">{t("fillRate")}</option>
          <option value="available">{t("mostAvailable")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted">{t("foodDrink")}</label>
        <select
          value={filters.foodDrink}
          onChange={(e) => update("foodDrink", e.target.value)}
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm sm:min-h-0 sm:py-1.5 min-h-[44px]"
        >
          <option value="">{t("any")}</option>
          <option value="true">{t("hasFoodDrink")}</option>
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
  const { t } = useI18n();
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
    if (filters.maxPrice === "0") {
      onChange({ ...filters, maxPrice: "", availability: "" });
    } else {
      clarityTag("filter", "free");
      onChange({ ...filters, maxPrice: "0", availability: "available,filling" });
    }
  };

  const toggleFilling = () => {
    update("availability", filters.availability === "filling" ? "" : "filling");
  };

  const toggleCheapest = () => {
    update("sortBy", filters.sortBy === "price" ? "time" : "price");
  };

  const toggleNearby = () => {
    if (!hasUserLocation) return;
    update("sortBy", filters.sortBy === "nearby" ? "time" : "nearby");
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-3 sm:p-4 space-y-3 sm:space-y-4">
      <form onSubmit={handleSearchSubmit} className="hidden gap-2 sm:flex">
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="min-h-[44px] shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
        >
          {t("search")}
        </button>
      </form>

      <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={toggleFree} className={pillClass(filters.maxPrice === "0")}>
          {t("free")}
        </button>
        <button
          type="button"
          onClick={toggleFilling}
          className={pillClass(filters.availability === "filling")}
        >
          {t("filling")}
        </button>
        <button type="button" onClick={toggleCheapest} className={pillClass(filters.sortBy === "price")}>
          {t("cheapest")}
        </button>
        <button
          type="button"
          onClick={toggleNearby}
          disabled={!hasUserLocation}
          className={`${pillClass(filters.sortBy === "nearby")} ${!hasUserLocation ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {t("nearby")}
        </button>
        <button
          type="button"
          onClick={() => setMoreFiltersOpen((o) => !o)}
          className={`${pillClass(moreFiltersOpen)} gap-1 pr-2.5`}
          aria-expanded={moreFiltersOpen}
        >
          <span>{t("filters")}</span>
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

      {moreFiltersOpen ? (
        <div className="mt-3 border-t border-card-border pt-3 sm:hidden">
          <AdvancedFilters filters={filters} update={update} />
        </div>
      ) : null}

      <div className="hidden sm:block">
        <AdvancedFilters filters={filters} update={update} />
      </div>

      <p className="text-xs text-muted">
        {sessionCount} {sessionCount !== 1 ? t("sessionsFound") : t("sessionFound")}
      </p>
    </div>
  );
}
