"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useSession, signOut } from "next-auth/react";
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

  if (status !== "authenticated" || !session?.user) return null;

  const { name, email, image } = session.user;
  const initials = (name ?? email ?? "?").charAt(0).toUpperCase();

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
              onClick={() => signOut({ callbackUrl: window.location.href })}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-primary/10 hover:text-primary transition"
            >
              Sign out
            </button>
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
