import { Star } from "lucide-react";

export const metadata = {
  title: "Favoris — BetIQ",
};

export default function FavorisPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Star className="h-6 w-6 text-yellow-400" />
          Mes favoris
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Vos matchs et équipes favoris
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Star className="h-12 w-12 text-slate-600 mb-4" />
        <h2 className="text-lg font-semibold text-slate-300 mb-2">
          Aucun favori pour le moment
        </h2>
        <p className="text-sm text-slate-500 max-w-xs">
          Ajoutez des matchs ou des équipes à vos favoris pour les retrouver ici facilement.
        </p>
      </div>
    </div>
  );
}
