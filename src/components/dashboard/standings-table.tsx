import Image from "next/image";
import type { Standing } from "@/lib/types";

interface StandingsTableProps {
  standings: Standing[];
  leagueName?: string;
}

export function StandingsTable({ standings, leagueName = "Ligue 1" }: StandingsTableProps) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{leagueName}</h3>
        <span className="text-xs text-slate-500">Classement</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/40">
              <th className="text-left px-4 py-2 text-slate-500 font-medium w-8">#</th>
              <th className="text-left px-2 py-2 text-slate-500 font-medium">Équipe</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium w-8">J</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium w-8">G</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium w-8">N</th>
              <th className="text-center px-2 py-2 text-slate-500 font-medium w-8">P</th>
              <th className="text-center px-2 py-2 text-slate-400 font-semibold w-10">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr
                key={s.team.id}
                className="border-b border-slate-700/30 last:border-0 hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span
                    className={
                      s.rank <= 3
                        ? "text-blue-400 font-semibold"
                        : s.rank <= 5
                        ? "text-yellow-400"
                        : "text-slate-500"
                    }
                  >
                    {s.rank}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="relative h-5 w-5 shrink-0">
                      <Image
                        src={s.team.logo}
                        alt={s.team.name}
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <span className="text-slate-200 font-medium truncate max-w-[120px]">
                      {s.team.name}
                    </span>
                  </div>
                </td>
                <td className="text-center px-2 py-2.5 text-slate-400">{s.played}</td>
                <td className="text-center px-2 py-2.5 text-green-400">{s.won}</td>
                <td className="text-center px-2 py-2.5 text-slate-400">{s.drawn}</td>
                <td className="text-center px-2 py-2.5 text-red-400">{s.lost}</td>
                <td className="text-center px-2 py-2.5 font-bold text-white">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
