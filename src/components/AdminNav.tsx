"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/content",  label: "Content"  },
  { href: "/admin/costs",    label: "Costs"    },
  { href: "/admin/settings", label: "Settings" },
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
      </div>
    </nav>
  );
}
