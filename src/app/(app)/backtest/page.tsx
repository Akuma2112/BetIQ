import { CalibrationChart, LineChart } from "@/components/charts";
import { Card, PageTitle, Stat, tone } from "@/components/ui";
import data from "@/data/backtest.json";
import { pct, shortDate, signedPct } from "@/lib/format";

export const metadata = { title: "Backtest · BetIQ" };

const ll = (x: number) => x.toFixed(4);

export default function BacktestPage() {
  const f = data.forecast;
  const avg = data.betting.avgPrices;
  const sharpOnly = data.betting.anchored.find((r) => r.modelWeight === 0 && r.priceSource === "priceMax");
  const sharpOnlyVal = data.betting.anchoredValidation.find((r) => r.modelWeight === 0 && r.priceSource === "priceMax");

  return (
    <>
      <PageTitle sub={`Walk-forward · test du ${shortDate(data.config.test.from)} au ${shortDate(data.config.test.to)} · ${f.n} matchs · généré le ${shortDate(data.generatedAt)}`}>
        Backtest
      </PageTitle>

      <Card highlight className="mb-4 p-4 text-sm leading-relaxed">
        <h2 className="mb-2 text-lg text-gold">Verdict</h2>
        <p>
          <strong>Le modèle Dixon-Coles + Elo ne bat pas le marché.</strong> Sa log-loss ({ll(f.model.logLoss)}) est moins bonne que celle du marché
          sharp à l’ouverture ({ll(f.marketOpening.logLoss)}) et à la clôture ({ll(f.marketClosing.logLoss)}), dans les trois championnats. Parier sur
          ses « values » aux cotes moyennes donne un yield de {signedPct(avg.yield)} et une CLV de {signedPct(avg.avgClv)}.
        </p>
        <p className="mt-2">
          Seule approche avec un signal positif : prendre la probabilité du marché sharp (Pinnacle/Betfair, dé-margée) et ne jouer que les cotes
          nettement supérieures — CLV {signedPct(sharpOnlyVal?.avgClv ?? null)} en validation, {signedPct(sharpOnly?.avgClv ?? null)} en test (
          {pct(sharpOnly?.positiveClvShare ?? null, 0)} des paris battent la clôture), mais sur les meilleures cotes du marché, pas forcément
          disponibles chez les bookmakers français. C’est pourquoi le poids du modèle est à 0 par défaut.
        </p>
      </Card>

      <Card className="mb-4 p-3">
        <h2 className="mb-2 text-lg">Qualité des probabilités (1N2)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1 font-normal" />
              <th className="py-1 text-right font-normal">Log-loss</th>
              <th className="py-1 text-right font-normal">Brier</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {(
              [
                ["Modèle (mélange)", f.model],
                ["Dixon-Coles seul", f.dixonColes],
                ["Elo seul", f.elo],
                ["Marché sharp ouverture", f.marketOpening],
                ["Marché sharp clôture", f.marketClosing],
              ] as const
            ).map(([name, s]) => (
              <tr key={name} className="border-t border-line/60">
                <td className="py-1.5 font-sans">{name}</td>
                <td className="py-1.5 text-right">{ll(s.logLoss)}</td>
                <td className="py-1.5 text-right">{ll(s.brier)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Plus bas = meilleur. Par championnat (log-loss modèle / marché clôture) :{" "}
          {Object.entries(data.forecastByLeague)
            .map(([k, v]) => `${k} ${ll(v.model.logLoss)} / ${ll(v.marketClosing.logLoss)}`)
            .join(" · ")}
        </p>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-3">
          <h2 className="mb-2 text-lg">Calibration</h2>
          <CalibrationChart bins={f.calibration} />
          <p className="mt-2 text-xs text-muted">Probabilité prédite (x) vs fréquence observée (y). Le modèle est bien calibré — il est juste moins informé que le marché.</p>
        </Card>
        <Card className="grid grid-cols-2 content-start gap-4 p-4">
          <Stat label="Paris (value ≥ 5 %)" value={avg.nBets} />
          <Stat label="Yield" value={<span className={tone(avg.yield)}>{signedPct(avg.yield)}</span>} />
          <Stat label="ROI (¼ Kelly)" value={<span className={tone(avg.roi)}>{signedPct(avg.roi)}</span>} />
          <Stat label="Drawdown max" value={pct(avg.maxDrawdown)} />
          <Stat label="CLV moyenne" value={<span className={tone(avg.avgClv)}>{signedPct(avg.avgClv)}</span>} accent />
          <Stat label="Battent la clôture" value={pct(avg.positiveClvShare, 0)} />
        </Card>
      </div>

      <Card className="mb-4 p-3">
        <h2 className="mb-2 text-lg">Bankroll simulée (modèle, cotes moyennes)</h2>
        <LineChart
          ariaLabel="Évolution de la bankroll simulée"
          series={[
            { name: "Cotes moyennes", color: "#c9a84c", points: avg.equity.map((p) => ({ x: new Date(p.date).getTime(), y: p.bankroll })) },
            { name: "Meilleures cotes", color: "#8a8a8a", dashed: true, points: data.betting.maxPrices.equity.map((p) => ({ x: new Date(p.date).getTime(), y: p.bankroll })) },
          ]}
          yFormat={(v) => `${Math.round(v)} €`}
          xFormat={(t) => shortDate(new Date(t).toISOString())}
        />
      </Card>

      <Card className="p-3">
        <h2 className="mb-2 text-lg">Poids du modèle vs marché sharp</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1 font-normal">Poids modèle</th>
              <th className="py-1 font-normal">Cotes</th>
              <th className="py-1 text-right font-normal">Paris</th>
              <th className="py-1 text-right font-normal">CLV</th>
              <th className="py-1 text-right font-normal">Yield</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {data.betting.anchored.map((r) => (
              <tr key={`${r.modelWeight}-${r.priceSource}`} className="border-t border-line/60">
                <td className="py-1.5">{r.modelWeight}</td>
                <td className="py-1.5 font-sans">{r.priceSource === "priceAvg" ? "moyennes" : "meilleures"}</td>
                <td className="py-1.5 text-right">{r.nBets}</td>
                <td className={`py-1.5 text-right ${tone(r.avgClv)}`}>{signedPct(r.avgClv)}</td>
                <td className={`py-1.5 text-right ${tone(r.yield)}`}>{signedPct(r.yield)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Seuil 3 %, période de test. Avec peu de paris, le yield est très bruité (±10 pts) ; la CLV converge beaucoup plus vite. Détails :
          docs/BACKTEST.md.
        </p>
      </Card>
    </>
  );
}
