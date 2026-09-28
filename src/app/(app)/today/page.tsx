import Link from "next/link";
import { Suspense } from "react";
import { FadeIn } from "@/components/fade-in";
import { TodayFilters } from "@/components/filters";
import { PicksTable } from "@/components/picks-table";
import { Card, Empty, PageTitle } from "@/components/ui";
import { getGuards, getLatestOdds, getPredictions, getSettings, getUpcoming } from "@/lib/data/queries";
import { dayKey, kickoff, LEAGUE_SHORT } from "@/lib/format";
import { buildPicks } from "@/lib/picks";
import { requireOwner } from "@/lib/supabase/server";

export const metadata = { title: "Matchs · BetIQ" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const { db } = await requireOwner();
  const settings = await getSettings(db);
  const guards = await getGuards(db, settings);
  const minValue = one("min") !== undefined ? Number(one("min")) / 100 : settings.valueThreshold;
  const league = one("league");
  const market = one("market");
  const onlyValue = one("v") === "1";

  const matches = (await getUpcoming(db)).filter((m) => !league || m.league_id === league);
  const ids = matches.map((m) => m.id);
  const [predictions, odds] = await Promise.all([getPredictions(db, ids), getLatestOdds(db, ids)]);

  const cards = matches
    .map((m) => {
      const prediction = predictions.get(m.id);
      if (!prediction) return { match: m, picks: null };
      const picks = buildPicks(prediction, odds.get(m.id) ?? [], { ...settings, valueThreshold: minValue }, guards).filter((p) =>
        market ? p.market === market : p.market !== "btts",
      );
      return { match: m, picks };
    })
    .filter((c) => !onlyValue || c.picks?.some((p) => p.isValue));

  const valueCount = cards.reduce((n, c) => n + (c.picks?.filter((p) => p.isValue).length ?? 0), 0);

  return (
    <>
      <PageTitle sub={`${cards.length} match${cards.length > 1 ? "s" : ""} · ${valueCount} pari${valueCount > 1 ? "s" : ""} à value ≥ ${Math.round(minValue * 100)} %`}>
        Prochains matchs
      </PageTitle>
      <Suspense>
        <TodayFilters defaultMin={Math.round(settings.valueThreshold * 100)} />
      </Suspense>
      {settings.modelWeight === 0 && (
        <p className="mb-4 text-xs text-muted">
          Proba retenue = marché sharp dé-margé (Shin). Le modèle est affiché à titre d’avis — voir{" "}
          <Link href="/backtest" className="text-gold underline">
            backtest
          </Link>
          .
        </p>
      )}
      {cards.length === 0 && <Empty>Aucun match à afficher. Les fixtures et cotes arrivent via les tâches planifiées.</Empty>}
      <div className="flex flex-col gap-3">
        {cards.map(({ match: m, picks }, i) => {
          const day = dayKey(m.kickoff_at);
          const header = i === 0 || dayKey(cards[i - 1].match.kickoff_at) !== day ? day : null;
          return (
            <FadeIn key={m.id} index={i}>
              {header && <h2 className="mb-2 mt-3 text-sm capitalize text-muted">{header}</h2>}
              <Card className="p-3" highlight={picks?.some((p) => p.isValue)}>
                <Link href={`/match/${m.id}`} className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {m.home} <span className="text-muted">–</span> {m.away}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {LEAGUE_SHORT[m.league_id]} · {kickoff(m.kickoff_at)}
                  </span>
                </Link>
                {picks ? <PicksTable picks={picks} matchId={m.id} guards={guards} /> : <p className="text-xs text-muted">Prédiction en attente du prochain recalcul.</p>}
              </Card>
            </FadeIn>
          );
        })}
      </div>
    </>
  );
}
