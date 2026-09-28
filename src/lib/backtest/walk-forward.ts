import type { OddsQuote } from "@/lib/providers/types";
import { suggestedStake, value, blend, clvFair } from "@/lib/model/betting";
import { devigShin } from "@/lib/model/margin";
import { fitLeague, predictMatch, type HistMatch, type ModelConfig } from "@/lib/model/predict";
import { brier, calibration, logLoss, summarizeBets, type Outcome3, type Probs3, type SettledBet } from "./metrics";

export interface BtMatch extends HistMatch {
  league: string;
  odds: OddsQuote[];
}

type OU = { over: number; under: number };

export interface BtPrediction {
  league: string;
  season: string;
  date: string;
  home: string;
  away: string;
  result: Outcome3;
  over25Hit: boolean;
  dc: Probs3;
  elo: Probs3;
  dcOver25: number;
  /** De-margined sharp prices: opening ≈ information at bet time, closing = benchmark. */
  marketOpen: Probs3 | null;
  marketClose: Probs3 | null;
  closeOU: OU | null;
  openOU: OU | null;
  /** Bet prices available ~2 days before kickoff. */
  priceAvg: (Probs3 & OU) | null;
  priceMax: (Probs3 & OU) | null;
}

const DAY = 86400 * 1000;

function mondayUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY);
}

function price(odds: OddsQuote[], book: string, closing: boolean, market: "h2h" | "totals_2_5", outcome: string) {
  return odds.find((q) => q.bookmaker === book && q.isClosing === closing && q.market === market && q.outcome === outcome)?.price;
}

function threeWay(odds: OddsQuote[], book: string, closing: boolean): number[] | null {
  const p = ["home", "draw", "away"].map((o) => price(odds, book, closing, "h2h", o));
  return p.every((v): v is number => v !== undefined) ? p : null;
}
function twoWay(odds: OddsQuote[], book: string, closing: boolean): number[] | null {
  const p = ["over", "under"].map((o) => price(odds, book, closing, "totals_2_5", o));
  return p.every((v): v is number => v !== undefined) ? p : null;
}

const SHARP = ["pinnacle", "betfair_ex"];

function fair3(odds: OddsQuote[], closing: boolean): Probs3 | null {
  for (const book of SHARP) {
    const o = threeWay(odds, book, closing);
    if (o) {
      const [home, draw, away] = devigShin(o).probs;
      return { home, draw, away };
    }
  }
  return null;
}
function fairOU(odds: OddsQuote[], closing: boolean): OU | null {
  for (const book of SHARP) {
    const o = twoWay(odds, book, closing);
    if (o) {
      const [over, under] = devigShin(o).probs;
      return { over, under };
    }
  }
  return null;
}
function prices(odds: OddsQuote[], book: string): (Probs3 & OU) | null {
  const h = threeWay(odds, book, false);
  const t = twoWay(odds, book, false);
  if (!h || !t) return null;
  return { home: h[0], draw: h[1], away: h[2], over: t[0], under: t[1] };
}

/** Walk-forward over one league: refit every Monday on strictly earlier matches. */
export function walkForward(all: BtMatch[], from: Date, to: Date, config: ModelConfig): BtPrediction[] {
  const sorted = [...all].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const test = sorted.filter((m) => m.kickoffAt >= from && m.kickoffAt < to);
  const weeks = new Map<number, BtMatch[]>();
  for (const m of test) {
    const k = mondayUtc(m.kickoffAt).getTime();
    weeks.set(k, [...(weeks.get(k) ?? []), m]);
  }
  const out: BtPrediction[] = [];
  for (const [weekStart, matches] of weeks) {
    const model = fitLeague(sorted, new Date(weekStart), matches[0].season, config);
    for (const m of matches) {
      const p = predictMatch(model, m.home, m.away);
      out.push({
        league: m.league,
        season: m.season,
        date: m.kickoffAt.toISOString(),
        home: m.home,
        away: m.away,
        result: m.homeGoals > m.awayGoals ? "home" : m.homeGoals === m.awayGoals ? "draw" : "away",
        over25Hit: m.homeGoals + m.awayGoals > 2,
        dc: { home: p.dc.home, draw: p.dc.draw, away: p.dc.away },
        elo: p.elo,
        dcOver25: p.dc.over25,
        marketOpen: fair3(m.odds, false),
        marketClose: fair3(m.odds, true),
        closeOU: fairOU(m.odds, true),
        openOU: fairOU(m.odds, false),
        priceAvg: prices(m.odds, "market_avg"),
        priceMax: prices(m.odds, "market_max"),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export const modelProbs = (p: BtPrediction, dcWeight: number): Probs3 => blend(p.dc, p.elo, dcWeight);

export function forecastMetrics(preds: BtPrediction[], dcWeight: number) {
  const withMarket = preds.filter((p) => p.marketOpen && p.marketClose);
  const rows = (f: (p: BtPrediction) => Probs3) => withMarket.map((p) => ({ p: f(p), y: p.result }));
  const score = (f: (p: BtPrediction) => Probs3) => ({ logLoss: logLoss(rows(f)), brier: brier(rows(f)) });
  return {
    n: withMarket.length,
    model: score((p) => modelProbs(p, dcWeight)),
    dixonColes: score((p) => p.dc),
    elo: score((p) => p.elo),
    marketOpening: score((p) => p.marketOpen!),
    marketClosing: score((p) => p.marketClose!),
    calibration: calibration(
      withMarket.flatMap((p) => {
        const m = modelProbs(p, dcWeight);
        return (["home", "draw", "away"] as const).map((o) => ({ p: m[o], hit: p.result === o }));
      }),
    ),
  };
}

export interface BetSimConfig {
  dcWeight: number;
  threshold: number;
  kellyMultiplier: number;
  maxStakePct: number;
  initialBankroll: number;
  priceSource: "priceAvg" | "priceMax";
  markets: ("1x2" | "ou25")[];
  /** Ignore prices above this (longshot noise). */
  maxOdds: number;
  /**
   * If set, probabilities are anchored to the sharp opening market:
   * p = w·model + (1 − w)·market. Bets then need both model and market to agree the price is soft.
   */
  marketAnchorModelWeight?: number;
}

export function simulateBets(preds: BtPrediction[], cfg: BetSimConfig) {
  const ordered = [...preds].sort((a, b) => a.date.localeCompare(b.date));
  let bankroll = cfg.initialBankroll;
  const bets: (SettledBet & { league: string; market: string })[] = [];
  for (const p of ordered) {
    const px = p[cfg.priceSource];
    if (!px) continue;
    const w = cfg.marketAnchorModelWeight;
    const anchored = w !== undefined;
    if (anchored && (!p.marketOpen || !p.openOU)) continue;
    const m = anchored ? blend(modelProbs(p, cfg.dcWeight), p.marketOpen!, w) : modelProbs(p, cfg.dcWeight);
    const pOver = anchored ? w * p.dcOver25 + (1 - w) * p.openOU!.over : p.dcOver25;
    const candidates: { market: string; prob: number; odds: number; won: boolean; fairClose: number | null }[] = [];
    if (cfg.markets.includes("1x2"))
      for (const o of ["home", "draw", "away"] as const)
        candidates.push({ market: "1x2", prob: m[o], odds: px[o], won: p.result === o, fairClose: p.marketClose?.[o] ?? null });
    if (cfg.markets.includes("ou25")) {
      candidates.push({ market: "ou25", prob: pOver, odds: px.over, won: p.over25Hit, fairClose: p.closeOU?.over ?? null });
      candidates.push({ market: "ou25", prob: 1 - pOver, odds: px.under, won: !p.over25Hit, fairClose: p.closeOU?.under ?? null });
    }
    for (const c of candidates) {
      if (c.odds > cfg.maxOdds || value(c.prob, c.odds) < cfg.threshold) continue;
      const stake = suggestedStake({ prob: c.prob, odds: c.odds, bankroll, kellyMultiplier: cfg.kellyMultiplier, maxStakePct: cfg.maxStakePct });
      if (stake <= 0) continue;
      bets.push({ date: p.date, stake, odds: c.odds, won: c.won, clv: c.fairClose === null ? null : clvFair(c.odds, c.fairClose), league: p.league, market: c.market });
      bankroll += c.won ? stake * (c.odds - 1) : -stake;
    }
  }
  const summary = summarizeBets(bets, cfg.initialBankroll);
  const by = (key: "league" | "market") => {
    const groups = new Map<string, typeof bets>();
    for (const b of bets) groups.set(b[key], [...(groups.get(b[key]) ?? []), b]);
    return Object.fromEntries(
      [...groups].map(([k, g]) => {
        const staked = g.reduce((s, b) => s + b.stake, 0);
        const profit = g.reduce((s, b) => s + (b.won ? b.stake * (b.odds - 1) : -b.stake), 0);
        const clvs = g.map((b) => b.clv).filter((c): c is number => c !== null);
        return [k, { nBets: g.length, staked, profit, yield: staked ? profit / staked : 0, avgClv: clvs.length ? clvs.reduce((s, c) => s + c, 0) / clvs.length : null }];
      }),
    );
  };
  return { ...summary, byLeague: by("league"), byMarket: by("market") };
}
