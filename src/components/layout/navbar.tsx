import { TrendingUp, BarChart2, Calendar, Star } from "lucide-react";
import Link from "next/link";

const navItems = [
  { href: "/", label: "Tableau de bord", icon: BarChart2 },
  { href: "/pronostics", label: "Pronostics", icon: TrendingUp },
  { href: "/matchs", label: "Matchs", icon: Calendar },
  { href: "/favoris", label: "Favoris", icon: Star },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">
              Bet<span className="text-blue-400">IQ</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs bg-green-500/15 text-green-400 border border-green-500/25 px-2.5 py-1 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              En direct
            </span>
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-md z-50">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{label.split(" ")[0]}</span>
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
