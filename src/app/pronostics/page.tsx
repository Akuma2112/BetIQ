import { TrendingUp } from "lucide-react";
import { Suspense } from "react";
import { MatchesSection } from "@/components/dashboard/matches-section";
import { MatchCardSkeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Pronostics — BetIQ",
};

function MatchesSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function PronosticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-blue-400" />
          Tous les pronostics
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Analyse IA de tous les matchs à venir
        </p>
      </div>

      <Suspense fallback={<MatchesSkeleton />}>
        <MatchesSection />
      </Suspense>
    </div>
  );
}
