import { MatchCard } from "./match-card";
import { ErrorState } from "@/components/ui/error-state";
import { getBaseUrl } from "@/lib/api-url";
import type { MatchWithPrediction } from "@/lib/types";

async function fetchMatches(): Promise<MatchWithPrediction[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("Échec du chargement des matchs");
  const json = await res.json() as { data: MatchWithPrediction[] };
  return json.data;
}

export async function MatchesSection() {
  let matches: MatchWithPrediction[] | null = null;
  let error: string | null = null;

  try {
    matches = await fetchMatches();
  } catch {
    error = "Impossible de charger les matchs à venir.";
  }

  if (error || !matches) {
    return <ErrorState message={error ?? "Données indisponibles"} />;
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        Aucun match à venir pour le moment.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  );
}
