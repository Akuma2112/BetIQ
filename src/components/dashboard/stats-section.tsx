import { Target, TrendingUp, BarChart2, Zap, Award, Flame } from "lucide-react";
import { StatCard } from "./stat-card";
import { ErrorState } from "@/components/ui/error-state";
import { getBaseUrl } from "@/lib/api-url";
import type { DashboardStats } from "@/lib/types";

async function fetchStats(): Promise<DashboardStats> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/stats`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("Échec du chargement des statistiques");
  const json = await res.json() as { data: DashboardStats };
  return json.data;
}

export async function StatsSection() {
  let stats: DashboardStats | null = null;
  let error: string | null = null;

  try {
    stats = await fetchStats();
  } catch {
    error = "Impossible de charger les statistiques de performance.";
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
        <ErrorState message={error ?? "Données indisponibles"} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label="Pronostics"
        value={stats.totalPredictions.toString()}
        subLabel="Total cette saison"
        icon={Target}
        color="blue"
      />
      <StatCard
        label="Taux de réussite"
        value={`${stats.winRate}%`}
        subLabel={`${stats.correctPredictions} corrects`}
        icon={Award}
        trend="up"
        trendValue="+2.3%"
        color="green"
      />
      <StatCard
        label="Cote moyenne"
        value={`${stats.avgOdds}`}
        subLabel="Sur les sélections"
        icon={BarChart2}
        color="blue"
      />
      <StatCard
        label="ROI"
        value={`${stats.roi}%`}
        subLabel="Retour sur investissement"
        icon={TrendingUp}
        trend="up"
        trendValue="+1.1%"
        color="green"
      />
      <StatCard
        label="Série en cours"
        value={`${stats.streak}`}
        subLabel="Pronostics gagnants"
        icon={Flame}
        color="yellow"
      />
      <StatCard
        label="Précision ML"
        value="71.2%"
        subLabel="Modèle IA"
        icon={Zap}
        trend="up"
        trendValue="+0.5%"
        color="blue"
      />
    </div>
  );
}
