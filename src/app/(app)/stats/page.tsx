import { LineChart } from "@/components/charts";
import { Card, Empty, PageTitle, Stat, tone } from "@/components/ui";
import { getBets, getSettings } from "@/lib/data/queries";
import { eur, LEAGUE_SHORT, MARKET_LABEL, pct, shortDate, signedEur, signedPct } from "@/lib/format";
import { aggregate, groupBy, oddsRange, profitCurve, type Aggregate } from "@/lib/stats";
import { requireOwner } from "@/lib/supabase/server";

export const metadata = { title: "Stats · BetIQ" };

function GroupTable({ title, rows }: { title: string; rows: { key: string; agg: Aggregate }[] }) {
  return (
    <Card className="p-3">
      <h2 className="mb-2 text-lg">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="py-1 font-normal" />
            <th className="py-1 text-right font-normal">Paris</th>
            <th className="py-1 text-right font-normal">CLV</th>
            <th className="py-1 text-right font-normal">Yield</th>
            <th className="py-1 text-right font-normal">P&L</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map(({ key, agg }) => (
            <tr key={key} className="border-t border-line/60">
              <td className="py-1.5 font-sans">{key}</td>
              <td className="py-1.5 text-right">{agg.nBets}</td>
              <td className={`py-1.5 text-right ${tone(agg.avgClv)}`}>{signedPct(agg.avgClv)}</td>
              <td className={`py-1.5 text-right ${tone(agg.yield)}`}>{signedPct(agg.yield)}</td>
              <td className={`py-1.5 text-right ${tone(agg.profit)}`}>{signedEur(agg.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function StatsPage() {
  const { db } = await requireOwner();
  const [bets, settings] = await Promise.all([getBets(db), getSettings(db)]);
  const all = aggregate(bets);
  const curve = profitCurve(bets);

  return (
    <>
      <PageTitle sub="La CLV est le vrai signal. Le profit à court terme est surtout du bruit.">Statistiques</PageTitle>
      {bets.length === 0 ? (
        <Empty>Pas encore de paris enregistrés.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <Card highlight className="p-5">
            <Stat
              big
              accent
              label="CLV moyenne (vs clôture sharp)"
              value={signedPct(all.avgClv, 2)}
              hint={`${pct(all.positiveClvShare, 0)} des paris battent la cote de clôture · ${all.nClv} paris mesurés`}
            />
            <p className="mt-3 text-xs text-muted">
              Une CLV positive et durable indique un vrai avantage, même si le solde est négatif sur quelques dizaines de paris. Une CLV négative signifie
              que le marché te bat, même si tu gagnes en ce moment.
            </p>
          </Card>
          <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <Stat label="Yield" value={<span className={tone(all.yield)}>{signedPct(all.yield)}</span>} hint="profit / misé" />
            <Stat label="ROI" value={<span className={tone(all.profit)}>{signedPct(all.profit / settings.bankroll)}</span>} hint="profit / bankroll" />
            <Stat label="P&L" value={<span className={tone(all.profit)}>{signedEur(all.profit)}</span>} hint={`misé ${eur(all.staked)}`} />
            <Stat label="Réussite" value={pct(all.hitRate, 0)} hint={`${all.nSettled} paris réglés`} />
          </Card>
          <Card className="p-3">
            <h2 className="mb-2 text-lg">Courbe de profit</h2>
            <LineChart
              ariaLabel="Profit cumulé"
              zeroLine
              series={[{ name: "Profit", color: "#c9a84c", points: curve.map((p) => ({ x: new Date(p.date).getTime(), y: p.profit })) }]}
              yFormat={(v) => `${Math.round(v)} €`}
              xFormat={(t) => shortDate(new Date(t).toISOString())}
            />
          </Card>
          <GroupTable title="Par championnat" rows={groupBy(bets, (b) => LEAGUE_SHORT[b.league_id] ?? b.league_id)} />
          <GroupTable title="Par marché" rows={groupBy(bets, (b) => MARKET_LABEL[b.market] ?? b.market)} />
          <GroupTable title="Par tranche de cote" rows={groupBy(bets, oddsRange)} />
        </div>
      )}
    </>
  );
}
