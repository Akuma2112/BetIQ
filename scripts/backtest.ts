/**
 * Walk-forward backtest on football-data.co.uk history (reads data/cache — run `npm run backfill -- --dry-run` first).
 *
 *   Validation (tuning ξ and the DC/Elo weight): 2023-24
 *   Test (out of sample, parameters frozen):     2024-25 → today
 *
 * Writes src/data/backtest.json (read by the /backtest page) and, if Supabase env is set, a backtest_runs row.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LEAGUES, fdcoukSeasonCode, seasonForDate } from "../src/lib/leagues";
import { parseFdcoukCsv } from "../src/lib/providers/fdcouk";
import { DEFAULT_MODEL, MODEL_VERSION, type ModelConfig } from "../src/lib/model/predict";
import { downsample } from "../src/lib/backtest/metrics";
import { forecastMetrics, simulateBets, walkForward, type BetSimConfig, type BtMatch, type BtPrediction } from "../src/lib/backtest/walk-forward";
import { createAdminClient } from "../src/lib/supabase/admin";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const VALIDATION = { from: new Date("2023-07-01T00:00:00Z"), to: new Date("2024-07-01T00:00:00Z") };
const TEST = { from: new Date("2024-07-01T00:00:00Z"), to: new Date() };
const XI_GRID = [0.001, 0.0019, 0.003];
const WEIGHT_GRID = [0, 0.25, 0.5, 0.7, 0.85, 1];

function loadLeague(fdcoukCode: string, leagueId: string): BtMatch[] {
  const current = Number(seasonForDate(new Date()).slice(0, 4));
  const out: BtMatch[] = [];
  for (let y = 2022; y <= current; y++) {
    const csv = readFileSync(join("data", "cache", `${fdcoukCode}_${fdcoukSeasonCode(y)}.csv`), "utf8");
    for (const m of parseFdcoukCsv(csv, y))
      out.push({ league: leagueId, home: m.homeTeam, away: m.awayTeam, homeGoals: m.homeGoals, awayGoals: m.awayGoals, kickoffAt: m.kickoffAt, season: m.season, odds: m.odds });
  }
  return out;
}

function run(data: Map<string, BtMatch[]>, period: { from: Date; to: Date }, cfg: ModelConfig): BtPrediction[] {
  return [...data.values()].flatMap((matches) => walkForward(matches, period.from, period.to, cfg));
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(2)}%`);

async function main() {
  const t0 = Date.now();
  const data = new Map(LEAGUES.map((l) => [l.id, loadLeague(l.fdcoukCode, l.id)]));

  // 1. Tune ξ on validation (log-loss of pure Dixon-Coles), then the blend weight.
  let best = { xi: DEFAULT_MODEL.xi, ll: Infinity, preds: [] as BtPrediction[] };
  for (const xi of XI_GRID) {
    const preds = run(data, VALIDATION, { ...DEFAULT_MODEL, xi });
    const ll = forecastMetrics(preds, 1).dixonColes.logLoss;
    console.log(`validation ξ=${xi}: DC log-loss ${ll.toFixed(4)}`);
    if (ll < best.ll) best = { xi, ll, preds };
  }
  const weightScores = WEIGHT_GRID.map((w) => ({ w, ll: forecastMetrics(best.preds, w).model.logLoss }));
  weightScores.forEach(({ w, ll }) => console.log(`validation dcWeight=${w}: log-loss ${ll.toFixed(4)}`));
  const dcWeight = weightScores.reduce((a, b) => (b.ll < a.ll ? b : a)).w;
  const tuned: ModelConfig = { ...DEFAULT_MODEL, xi: best.xi, dcWeight };
  console.log(`→ chosen ξ=${tuned.xi}, dcWeight=${dcWeight}\n`);

  // 2. Out-of-sample test with frozen parameters.
  const testPreds = run(data, TEST, tuned);
  const forecast = forecastMetrics(testPreds, dcWeight);
  const forecastByLeague = Object.fromEntries(LEAGUES.map((l) => [l.id, forecastMetrics(testPreds.filter((p) => p.league === l.id), dcWeight)]));

  const baseSim: BetSimConfig = {
    dcWeight,
    threshold: 0.05,
    kellyMultiplier: 0.25,
    maxStakePct: 0.02,
    initialBankroll: 1000,
    priceSource: "priceAvg",
    markets: ["1x2", "ou25"],
    maxOdds: 10,
  };
  const anchoredGrid = (preds: BtPrediction[]) =>
    [1, 0.5, 0.25, 0].flatMap((w) =>
      (["priceAvg", "priceMax"] as const).map((priceSource) => {
        const s = simulateBets(preds, { ...baseSim, priceSource, marketAnchorModelWeight: w, threshold: 0.03 });
        return { modelWeight: w, priceSource, nBets: s.nBets, yield: s.yield, roi: s.roi, avgClv: s.avgClv, positiveClvShare: s.positiveClvShare, maxDrawdown: s.maxDrawdown };
      }),
    );
  const anchoredValidation = anchoredGrid(best.preds);
  const betting = {
    avgPrices: simulateBets(testPreds, baseSim),
    maxPrices: simulateBets(testPreds, { ...baseSim, priceSource: "priceMax" }),
    anchored: anchoredGrid(testPreds),
    anchoredValidation,
    thresholds: [0.02, 0.05, 0.1, 0.15].map((threshold) => {
      const s = simulateBets(testPreds, { ...baseSim, threshold });
      return { threshold, nBets: s.nBets, yield: s.yield, roi: s.roi, avgClv: s.avgClv, maxDrawdown: s.maxDrawdown };
    }),
  };

  const result = {
    generatedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    config: { model: tuned, betting: baseSim, validation: VALIDATION, test: { from: TEST.from, to: TEST.to } },
    validation: { xiGrid: XI_GRID, weightScores, chosen: { xi: tuned.xi, dcWeight } },
    forecast,
    forecastByLeague,
    betting: {
      ...betting,
      avgPrices: { ...betting.avgPrices, equity: downsample(betting.avgPrices.equity) },
      maxPrices: { ...betting.maxPrices, equity: downsample(betting.maxPrices.equity) },
    },
  };

  mkdirSync(join("src", "data"), { recursive: true });
  writeFileSync(join("src", "data", "backtest.json"), JSON.stringify(result, null, 1));

  const f = forecast;
  console.log(`TEST (${f.n} matches, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log(`log-loss  model ${f.model.logLoss.toFixed(4)} | DC ${f.dixonColes.logLoss.toFixed(4)} | Elo ${f.elo.logLoss.toFixed(4)} | market open ${f.marketOpening.logLoss.toFixed(4)} | market close ${f.marketClosing.logLoss.toFixed(4)}`);
  console.log(`brier     model ${f.model.brier.toFixed(4)} | market open ${f.marketOpening.brier.toFixed(4)} | market close ${f.marketClosing.brier.toFixed(4)}`);
  for (const [name, s] of Object.entries({ "avg prices": betting.avgPrices, "max prices": betting.maxPrices }))
    console.log(`bets @${name}: n=${s.nBets} yield ${pct(s.yield)} ROI ${pct(s.roi)} maxDD ${pct(s.maxDrawdown)} avgCLV ${pct(s.avgClv)} CLV>0 ${pct(s.positiveClvShare)}`);
  console.log("by league (avg):", JSON.stringify(betting.avgPrices.byLeague));
  console.log("by market (avg):", JSON.stringify(betting.avgPrices.byMarket));
  console.log("anchored VALIDATION (threshold 3%):"); console.table(anchoredValidation.map((r) => ({ w: r.modelWeight, px: r.priceSource, n: r.nBets, yield: pct(r.yield), clv: pct(r.avgClv), clvPos: pct(r.positiveClvShare) })));
  console.log("anchored TEST (threshold 3%):"); console.table(betting.anchored.map((r) => ({ w: r.modelWeight, px: r.priceSource, n: r.nBets, yield: pct(r.yield), clv: pct(r.avgClv), clvPos: pct(r.positiveClvShare) })));
  console.log("thresholds (avg):", JSON.stringify(betting.thresholds));

  if (process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { error } = await createAdminClient()
      .from("backtest_runs")
      .insert({ config: result.config, metrics: { forecast, betting: { avg: { ...betting.avgPrices, equity: undefined } } }, series: { calibration: forecast.calibration, equity: result.betting.avgPrices.equity } });
    console.log(error ? `DB insert failed: ${error.message}` : "Saved to backtest_runs");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
