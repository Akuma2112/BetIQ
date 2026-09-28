import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyseButton } from "@/components/analyse-button";
import { Heatmap, LineChart, type Series } from "@/components/charts";
import { PicksTable } from "@/components/picks-table";
import { Card, PageTitle, Stat } from "@/components/ui";
import { getGuards, getLatestOdds, getMatch, getOddsHistory, getPredictions, getSettings } from "@/lib/data/queries";
import { kickoff, pct } from "@/lib/format";
import { leagueById, type LeagueId } from "@/lib/leagues";
import { BOOK_LABELS, buildPicks } from "@/lib/picks";
import { requireOwner } from "@/lib/supabase/server";

const BOOK_COLORS: Record<string, string> = {
  pinnacle: "#f0f0f0",
  betfair_ex: "#8a8a8a",
  winamax_fr: "#c9a84c",
  betclic_fr: "#d0564b",
  unibet_fr: "#4caf7d",
  pmu_fr: "#5b8def",
  netbet_fr: "#b07cd8",
};

export default async function MatchPage({ params }: PageProps<"/match/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { db } = await requireOwner();
  const match = await getMatch(db, id);
  if (!match) notFound();

  const settings = await getSettings(db);
  const [guards, predictions, latest, history] = await Promise.all([getGuards(db, settings), getPredictions(db, [id]), getLatestOdds(db, [id]), getOddsHistory(db, id)]);
  const prediction = predictions.get(id);
  const picks = prediction ? buildPicks(prediction, latest.get(id) ?? [], settings, guards) : null;

  // Odds history of the home-win price per bookmaker.
  const t0 = history.length ? new Date(history[0].captured_at).getTime() : 0;
  const bySeries = new Map<string, Series>();
  for (const q of history.filter((h) => h.market === "h2h" && h.outcome === "home")) {
    const s = bySeries.get(q.bookmaker) ?? { name: BOOK_LABELS[q.bookmaker] ?? q.bookmaker, color: BOOK_COLORS[q.bookmaker] ?? "#666", points: [], dashed: q.bookmaker === "pinnacle" || q.bookmaker === "betfair_ex" };
    s.points.push({ x: (new Date(q.captured_at).getTime() - t0) / 3600000, y: Number(q.price) });
    bySeries.set(q.bookmaker, s);
  }

  return (
    <>
      <Link href="/today" className="mb-3 inline-block text-sm text-muted hover:text-fg">
        ← Matchs
      </Link>
      <PageTitle sub={`${leagueById(match.league_id as LeagueId).name} · ${kickoff(match.kickoff_at)}`}>
        {match.home} – {match.away}
      </PageTitle>

      {prediction ? (
        <>
          <Card className="mb-4 grid grid-cols-3 gap-3 p-4">
            <Stat label="Buts attendus" value={`${Number(prediction.lambda_home).toFixed(2)} – ${Number(prediction.lambda_away).toFixed(2)}`} />
            <Stat label="+2.5 buts" value={pct(prediction.p_over_2_5, 0)} />
            <Stat label="Les 2 marquent" value={pct(prediction.p_btts, 0)} />
          </Card>
          <Card className="mb-4 p-3">
            <h2 className="mb-2 text-lg">Probabilités & cotes</h2>
            <PicksTable picks={picks!} matchId={id} guards={guards} />
            <p className="mt-2 text-[11px] text-muted">
              Modèle : Dixon-Coles {pct(prediction.components.dc.home, 0)}/{pct(prediction.components.dc.draw, 0)}/{pct(prediction.components.dc.away, 0)} · Elo{" "}
              {pct(prediction.components.elo.home, 0)}/{pct(prediction.components.elo.draw, 0)}/{pct(prediction.components.elo.away, 0)} · Marché = {picks?.[0]?.sharpBook ?? "n/d"} (Shin)
            </p>
          </Card>
          <Card className="mb-4 p-3">
            <h2 className="mb-3 text-lg">Scores probables (%)</h2>
            <Heatmap matrix={prediction.score_matrix} home={match.home} away={match.away} />
          </Card>
        </>
      ) : (
        <Card className="mb-4 p-4 text-sm text-muted">Pas encore de prédiction pour ce match.</Card>
      )}

      <Card className="mb-4 p-3">
        <h2 className="mb-3 text-lg">Évolution de la cote « 1 »</h2>
        <LineChart series={[...bySeries.values()]} ariaLabel="Historique des cotes victoire domicile" xFormat={(h) => `+${Math.round(h)} h`} />
      </Card>

      {prediction && (
        <Card className="p-4">
          <h2 className="mb-3 text-lg">Analyse</h2>
          <AnalyseButton matchId={id} />
        </Card>
      )}
    </>
  );
}
