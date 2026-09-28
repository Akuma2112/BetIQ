import Link from "next/link";
import { FadeIn } from "@/components/fade-in";
import { SettleButtons } from "@/components/settle-buttons";
import { Card, Empty, PageTitle, Stat, tone } from "@/components/ui";
import { getBets, getGuards, getSettings } from "@/lib/data/queries";
import { eur, kickoff, LEAGUE_SHORT, MARKET_LABEL, odds, OUTCOME_LABEL, signedEur, signedPct } from "@/lib/format";
import { BOOK_LABELS } from "@/lib/picks";
import { aggregate } from "@/lib/stats";
import { requireOwner } from "@/lib/supabase/server";

export const metadata = { title: "Paris · BetIQ" };

const STATUS: Record<string, string> = { pending: "En cours", won: "Gagné", lost: "Perdu", void: "Remboursé" };

export default async function BetsPage() {
  const { db } = await requireOwner();
  const settings = await getSettings(db);
  const [bets, guards] = await Promise.all([getBets(db), getGuards(db, settings)]);
  const agg = aggregate(bets);
  const pending = bets.filter((b) => b.status === "pending");

  return (
    <>
      <PageTitle sub="Enregistre un pari en 2 clics depuis un match, puis indique le résultat.">Journal</PageTitle>
      <Card className="mb-5 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Stat label="CLV moyenne" value={signedPct(agg.avgClv)} accent hint={`${agg.nClv} paris mesurés`} />
        <Stat label="P&L" value={<span className={tone(agg.profit)}>{signedEur(agg.profit)}</span>} />
        <Stat label="En cours" value={`${pending.length}`} hint={eur(pending.reduce((s, b) => s + b.stake, 0))} />
        <Stat label="Budget restant" value={eur(guards.budgetRemaining)} hint={`sur ${eur(settings.monthlyBudget)} / mois`} />
      </Card>

      {bets.length === 0 && (
        <Empty>
          Aucun pari. Les paris à value apparaissent en doré sur{" "}
          <Link href="/today" className="text-gold underline">
            Matchs
          </Link>
          .
        </Empty>
      )}
      <ul className="flex flex-col gap-2">
        {bets.map((b, i) => (
          <FadeIn key={b.id} index={i}>
            <li>
              <Card className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/match/${b.match_id}`} className="font-medium">
                    {b.home} – {b.away}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {LEAGUE_SHORT[b.league_id]} · {kickoff(b.kickoff_at)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 font-mono text-sm tabular-nums">
                  <div>
                    <div className="font-sans text-[10px] uppercase text-muted">{MARKET_LABEL[b.market]}</div>
                    {OUTCOME_LABEL[b.outcome]} @ {odds(b.odds_taken)}
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-muted">Mise</div>
                    {eur(b.stake)}
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-muted">CLV</div>
                    <span className={tone(b.clv)}>{signedPct(b.clv)}</span>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] uppercase text-muted">{STATUS[b.status]}</div>
                    <span className={tone(b.pnl)}>{b.pnl === null ? "—" : signedEur(b.pnl)}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {BOOK_LABELS[b.bookmaker] ?? b.bookmaker} · value {signedPct(Number(b.value_at_bet))}
                    {b.closing_odds && ` · clôture ${odds(b.closing_odds)}`}
                  </span>
                  <SettleButtons id={b.id} status={b.status} />
                </div>
              </Card>
            </li>
          </FadeIn>
        ))}
      </ul>
    </>
  );
}
