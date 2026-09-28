"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/today", label: "Matchs", icon: "M4 5h16M4 12h16M4 19h10" },
  { href: "/bets", label: "Paris", icon: "M5 4h14v16H5zM9 9h6M9 13h6" },
  { href: "/stats", label: "Stats", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/backtest", label: "Backtest", icon: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2" },
  { href: "/settings", label: "Réglages", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 .5-1.5-1L15 4h-6l-.5 2.5-1.5 1L5 7l-2 4 2 1-.1 1.5L3 15l2 4 2-.5 1.5 1L9 22h6l.5-2.5 1.5-1 2 .5 2-4-2-1z" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:border-t-0 md:border-b">
      <ul className="mx-auto flex max-w-3xl justify-around md:justify-end md:gap-6 md:px-4">
        {ITEMS.map((item) => {
          const active = path === item.href || path.startsWith(`${item.href}/`) || (item.href === "/today" && path.startsWith("/match"));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] md:flex-row md:gap-2 md:text-sm ${active ? "text-gold" : "text-muted hover:text-fg"}`}
              >
                <svg viewBox="0 0 24 24" className="size-5 md:size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
