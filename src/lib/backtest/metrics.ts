/** Forecast-quality and betting metrics. Pure. */

export type Outcome3 = "home" | "draw" | "away";
export type Probs3 = Record<Outcome3, number>;
const OUTCOMES: Outcome3[] = ["home", "draw", "away"];

/** Mean multi-class log-loss (natural log). Lower is better. */
export function logLoss(rows: { p: Probs3; y: Outcome3 }[]): number {
  if (rows.length === 0) return NaN;
  return rows.reduce((s, r) => s - Math.log(Math.max(r.p[r.y], 1e-12)), 0) / rows.length;
}

/** Mean multi-class Brier score (sum over the 3 outcomes). Lower is better. */
export function brier(rows: { p: Probs3; y: Outcome3 }[]): number {
  if (rows.length === 0) return NaN;
  return rows.reduce((s, r) => s + OUTCOMES.reduce((t, o) => t + (r.p[o] - (r.y === o ? 1 : 0)) ** 2, 0), 0) / rows.length;
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  meanPred: number;
  observed: number;
  n: number;
}

/** Pools every (probability, happened?) pair into equal-width bins. */
export function calibration(pairs: { p: number; hit: boolean }[], bins = 10): CalibrationBin[] {
  const acc = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, sumP: 0, hits: 0, n: 0 }));
  for (const { p, hit } of pairs) {
    const b = acc[Math.min(bins - 1, Math.floor(p * bins))];
    b.sumP += p;
    b.hits += hit ? 1 : 0;
    b.n++;
  }
  return acc.filter((b) => b.n > 0).map((b) => ({ lo: b.lo, hi: b.hi, meanPred: b.sumP / b.n, observed: b.hits / b.n, n: b.n }));
}

export interface SettledBet {
  date: string;
  stake: number;
  odds: number;
  won: boolean;
  /** EV vs de-margined sharp closing probability (odds · p_close − 1), if known. */
  clv: number | null;
}

export interface BettingSummary {
  nBets: number;
  staked: number;
  profit: number;
  /** profit / initial bankroll */
  roi: number;
  /** profit / total staked */
  yield: number;
  maxDrawdown: number;
  finalBankroll: number;
  avgClv: number | null;
  positiveClvShare: number | null;
  hitRate: number;
  avgOdds: number;
  equity: { date: string; bankroll: number }[];
}

/** Bets must be in chronological order; stakes are already sized. */
export function summarizeBets(bets: SettledBet[], initialBankroll: number): BettingSummary {
  let bankroll = initialBankroll;
  let peak = initialBankroll;
  let maxDrawdown = 0;
  let staked = 0;
  let wins = 0;
  const equity = [{ date: bets[0]?.date ?? "", bankroll }];
  for (const b of bets) {
    staked += b.stake;
    const pnl = b.won ? b.stake * (b.odds - 1) : -b.stake;
    bankroll += pnl;
    if (b.won) wins++;
    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.max(maxDrawdown, (peak - bankroll) / peak);
    equity.push({ date: b.date, bankroll });
  }
  const clvs = bets.map((b) => b.clv).filter((c): c is number => c !== null);
  const profit = bankroll - initialBankroll;
  return {
    nBets: bets.length,
    staked,
    profit,
    roi: profit / initialBankroll,
    yield: staked > 0 ? profit / staked : 0,
    maxDrawdown,
    finalBankroll: bankroll,
    avgClv: clvs.length ? clvs.reduce((s, c) => s + c, 0) / clvs.length : null,
    positiveClvShare: clvs.length ? clvs.filter((c) => c > 0).length / clvs.length : null,
    hitRate: bets.length ? wins / bets.length : 0,
    avgOdds: bets.length ? bets.reduce((s, b) => s + b.odds, 0) / bets.length : 0,
    equity,
  };
}

/** Keep at most `max` points (always keeps first and last). */
export function downsample<T>(points: T[], max = 300): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}
