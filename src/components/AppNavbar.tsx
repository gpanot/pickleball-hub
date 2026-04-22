"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: { href: string; label: string; active: (path: string) => boolean }[] = [
  { href: "/", label: "Sessions", active: (p) => p === "/" },
  { href: "/clubs", label: "Clubs", active: (p) => p === "/clubs" || p.startsWith("/clubs/") },
  {
    href: "/dashboard/organizer",
    label: "Organizer",
    active: (p) => p.startsWith("/dashboard/organizer"),
  },
  {
    href: "/dashboard/venue",
    label: "Venue",
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

export function AppNavbar() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="sticky top-0 z-50 border-b border-card-border bg-card/95 backdrop-blur-md">
      {/* Mobile: full-width tab bar */}
      <div className="grid h-12 grid-cols-4 md:hidden sm:h-14">
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
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Desktop: brand + inline links */}
      <div className="hidden md:flex md:h-14 md:max-w-7xl md:mx-auto md:items-stretch md:justify-between md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center border-b-2 border-transparent pr-4">
          <Link href="/" className="min-w-0 font-bold tracking-tight">
            <span className="text-primary">HCM</span>{" "}
            <span className="text-foreground">Pickleball Hub</span>
          </Link>
        </div>
        <ul className="m-0 flex list-none items-stretch gap-0 p-0 sm:gap-1">
          {tabs.map((tab) => {
            const isActive = tab.active(pathname);
            return (
              <li key={tab.href} className="flex">
                <Link
                  href={tab.href}
                  className={`inline-flex min-h-14 items-center px-3 py-0 lg:px-4 ${navLinkClass(isActive)}`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
