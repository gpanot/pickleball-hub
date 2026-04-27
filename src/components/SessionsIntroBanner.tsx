"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

const LS_KEY = "intro_dismissed";
const EXIT_MS = 320;

export function SessionsIntroBanner() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"boot" | "show" | "exit" | "gone">("boot");

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      setPhase(localStorage.getItem(LS_KEY) === "true" ? "gone" : "show");
    } catch {
      setPhase("gone");
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, "true");
    } catch {
      /* private mode / quota */
    }
    setPhase("exit");
    window.setTimeout(() => setPhase("gone"), EXIT_MS);
  }, []);

  if (phase === "boot" || phase === "gone") return null;

  const exiting = phase === "exit";

  return (
    <div
      className={`min-w-0 transition-[margin-bottom] duration-300 ease-out ${exiting ? "mb-0" : "mb-4"}`}
      aria-hidden={exiting}
    >
      <div
        className={`relative overflow-hidden rounded-xl border border-card-border bg-[#f0fdf4] p-3 shadow-sm transition-[max-height,opacity,padding,border-color] duration-300 ease-out dark:border-emerald-900/50 dark:bg-emerald-950/30 ${
          exiting
            ? "pointer-events-none max-h-0 border-transparent py-0 opacity-0"
            : "max-h-[min(80vh,28rem)] border-l-[3px] border-l-primary opacity-100"
        }`}
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          aria-label={t("close")}
        >
          <span className="text-lg leading-none" aria-hidden>
            ×
          </span>
        </button>
        <p className="pr-8 text-sm font-semibold text-foreground">{t("introBannerTitle")}</p>
        <p className="mt-1 pr-6 text-xs leading-relaxed text-muted sm:text-sm">{t("introBannerBody")}</p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 text-left text-sm font-semibold text-primary transition hover:text-primary-dark"
        >
          {t("introBannerCta")}
        </button>
      </div>
    </div>
  );
}
