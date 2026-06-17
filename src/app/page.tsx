import { Suspense } from "react";
import { TrendingUp, Info } from "lucide-react";
import { StatsSection } from "@/components/dashboard/stats-section";
import { MatchesSection } from "@/components/dashboard/matches-section";
import { StandingsSection } from "@/components/dashboard/standings-section";
import {
  StatCardSkeleton,
  MatchCardSkeleton,
  StandingsSkeleton,
} from "@/components/ui/skeleton";

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-400" />
            Tableau de bord
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Pronostics IA · Mis à jour toutes les 5 minutes
          </p>
        </div>

        {/* Mock data banner */}
        <div className="flex items-center gap-2 text-xs bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 px-3 py-2 rounded-lg">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Données de démonstration — Connectez votre clé API-Football</span>
        </div>
      </div>

      {/* Stats */}
      <section aria-label="Statistiques de performance">
        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection />
        </Suspense>
      </section>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Matches */}
        <section className="lg:col-span-2" aria-label="Pronostics à venir">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">
              Pronostics à venir
            </h2>
            <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              5 matchs
            </span>
          </div>
          <Suspense fallback={<MatchesSkeleton />}>
            <MatchesSection />
          </Suspense>
        </section>

        {/* Sidebar */}
        <aside className="space-y-6" aria-label="Classement">
          <div>
            <h2 className="text-base font-semibold text-white mb-4">
              Classement
            </h2>
            <Suspense fallback={<StandingsSkeleton />}>
              <StandingsSection />
            </Suspense>
          </div>

          {/* Quick tips */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Guide de lecture
            </h3>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-green-400 font-bold shrink-0">V</span>
                Victoire lors des 5 derniers matchs
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 font-bold shrink-0">N</span>
                Match nul lors des 5 derniers matchs
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 font-bold shrink-0">D</span>
                Défaite lors des 5 derniers matchs
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">↑</span>
                Confiance élevée ≥ 75%
              </li>
            </ul>
          </div>

          {/* Disclaimer */}
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-4">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              <strong className="text-slate-400">Avertissement :</strong> Les
              pronostics sont fournis à titre informatif uniquement. Les paris
              sportifs comportent des risques. Jouez de manière responsable.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
