"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/content",  label: "Content"  },
  { href: "/admin/costs",    label: "Costs"    },
  { href: "/admin/settings", label: "Settings" },
];

const EXPERIMENTAL_LINKS = [
  { href: "/admin/ai-assistant", label: "AI Assistant" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-800 bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 flex items-center gap-1 h-12">
        <span className="text-xs font-semibold text-gray-600 mr-3 tracking-widest uppercase">
          Admin
        </span>
        {LINKS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 text-sm rounded transition ${
                active
                  ? "text-emerald-400 border-b-2 border-emerald-500 font-medium"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {label}
            </Link>
          );
        })}

        <span className="ml-4 mr-1 text-[10px] font-semibold text-gray-700 tracking-widest uppercase">
          Experimental
        </span>
        {EXPERIMENTAL_LINKS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 text-sm rounded transition ${
                active
                  ? "text-violet-400 border-b-2 border-violet-500 font-medium"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
