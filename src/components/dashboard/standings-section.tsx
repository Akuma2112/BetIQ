import { StandingsTable } from "./standings-table";
import { ErrorState } from "@/components/ui/error-state";
import { getBaseUrl } from "@/lib/api-url";
import type { Standing } from "@/lib/types";

async function fetchStandings(): Promise<Standing[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/standings`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error("Échec du chargement du classement");
  const json = await res.json() as { data: Standing[] };
  return json.data;
}

export async function StandingsSection() {
  let standings: Standing[] | null = null;
  let error: string | null = null;

  try {
    standings = await fetchStandings();
  } catch {
    error = "Impossible de charger le classement.";
  }

  if (error || !standings) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
        <ErrorState message={error ?? "Données indisponibles"} />
      </div>
    );
  }

  return <StandingsTable standings={standings} leagueName="Ligue 1" />;
}
