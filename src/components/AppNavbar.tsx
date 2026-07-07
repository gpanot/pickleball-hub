"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useSession, signOut, signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const tabs: { href: string; labelKey: TranslationKey; active: (path: string) => boolean }[] = [
  { href: "/", labelKey: "navSessions", active: (p) => p === "/" },
  { href: "/clubs", labelKey: "navClubs", active: (p) => p === "/clubs" || p.startsWith("/clubs/") },
  { href: "/heatmap", labelKey: "navHeatmap", active: (p) => p === "/heatmap" },
  {
    href: "/dashboard/organizer",
    labelKey: "navOrganizer",
    active: (p) => p.startsWith("/dashboard/organizer"),
  },
  {
    href: "/dashboard/venue",
    labelKey: "navVenue",
    active: (p) => p.startsWith("/dashboard/venue"),
  },
];

function navLinkClass(isActive: boolean) {
  return `border-b-2 text-sm font-semibold transition ${
    isActive
      ? "border-primary text-primary"
      : "border-transparent text-muted hover:text-foreground"
  }`;
}

function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const next = locale === "en" ? "vi" : "en";
  const flag = locale === "en" ? "🇻🇳" : "🇬🇧";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      className="flex items-center justify-center rounded-md px-1.5 py-1 text-base leading-none transition hover:bg-primary/10 active:scale-95"
      aria-label={`Switch to ${next === "vi" ? "Vietnamese" : "English"}`}
      title={next === "vi" ? "Chuyển sang Tiếng Việt" : "Switch to English"}
    >
      {flag}
    </button>
  );
}

function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkMessage, setUnlinkMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / touch
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [open]);

  if (status === "loading") return <div className="h-8 w-8 rounded-full bg-card-border animate-pulse" />;

  if (status === "unauthenticated") {
    return (
      <button
        onClick={() => signIn("google", { callbackUrl: window.location.href })}
        className="flex items-center gap-1.5 rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/60 hover:text-primary transition"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in
      </button>
    );
  }

  if (status !== "authenticated" || !session?.user) return null;

  const { name, email, image } = session.user;
  const initials = (name ?? email ?? "?").charAt(0).toUpperCase();

  async function handleUnlinkReclub() {
    const ok = window.confirm("Unlink your Reclub account from this profile?");
    if (!ok) return;

    try {
      setUnlinking(true);
      setUnlinkMessage(null);

      const res = await fetch("/api/auth/unlink-reclub", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to unlink account");
      }

      setUnlinkMessage("Reclub account unlinked.");
    } catch {
      setUnlinkMessage("Could not unlink Reclub right now.");
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden ring-2 ring-transparent hover:ring-primary/40 transition focus:outline-none"
        aria-label="User menu"
      >
        {image ? (
          <Image src={image} alt={name ?? "User"} width={32} height={32} className="rounded-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-card-border bg-card shadow-lg">
          {/* User info */}
          <div className="border-b border-card-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-foreground">{name ?? "User"}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
          {/* Sign out */}
          <div className="p-1.5">
            <button
              onClick={handleUnlinkReclub}
              disabled={unlinking}
              className="mb-1 w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-primary/10 hover:text-primary transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {unlinking ? "Unlinking..." : "Unlink my Reclub"}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: window.location.href })}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-primary/10 hover:text-primary transition"
            >
              Sign out
            </button>
            {unlinkMessage && (
              <p className="px-3 pt-2 text-xs text-muted">{unlinkMessage}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppNavbar() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();

  return (
    <nav className="sticky top-0 z-50 border-b border-card-border bg-card/95 backdrop-blur-md">
      {/* Mobile: full-width tab bar + language toggle + avatar */}
      <div className="flex h-12 items-stretch md:hidden sm:h-14">
        <div className="grid flex-1 grid-cols-5">
          {tabs.map((tab) => {
            const isActive = tab.active(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex min-h-[48px] items-center justify-center border-b-2 px-1 text-center text-xs font-semibold transition sm:min-h-[56px] sm:px-2 sm:text-sm ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2">
          <LanguageToggle />
          <UserMenu />
        </div>
      </div>

      {/* Desktop: brand + inline links + language toggle + avatar */}
      <div className="hidden md:flex md:h-14 md:max-w-7xl md:mx-auto md:items-stretch md:justify-between md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center border-b-2 border-transparent pr-4">
          <Link href="/" className="min-w-0 font-bold tracking-tight">
            <span className="text-primary">HCM</span>{" "}
            <span className="text-foreground">Pickleball Hub</span>
          </Link>
        </div>
        <div className="flex items-stretch">
          <ul className="m-0 flex list-none items-stretch gap-0 p-0 sm:gap-1">
            {tabs.map((tab) => {
              const isActive = tab.active(pathname);
              return (
                <li key={tab.href} className="flex">
                  <Link
                    href={tab.href}
                    className={`inline-flex min-h-14 items-center px-3 py-0 lg:px-4 ${navLinkClass(isActive)}`}
                  >
                    {t(tab.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 border-b-2 border-transparent pl-3">
            <LanguageToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}
