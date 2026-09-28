import type { BetStatus } from "./guardrails";

/** Betting-journal aggregates. Pure. */

export interface BetRow {
  id: number;
  placed_at: string;
  league_id: string;
  market: string;
  odds_taken: number;
  stake: number;
  status: BetStatus;
  pnl: number | null;
  clv: number | null;
}

export function betPnl(status: BetStatus, stake: number, odds: number): number | null {
  if (status === "won") return Math.round(stake * (odds - 1) * 100) / 100;
  if (status === "lost") return -stake;
  if (status === "void") return 0;
  return null;
}

export interface Aggregate {
  nBets: number;
  nSettled: number;
  staked: number;
  profit: number;
  yield: number | null;
  avgClv: number | null;
  positiveClvShare: number | null;
  nClv: number;
  hitRate: number | null;
}

export function aggregate(bets: BetRow[]): Aggregate {
  const settled = bets.filter((b) => b.status === "won" || b.status === "lost");
  const staked = settled.reduce((s, b) => s + b.stake, 0);
  const profit = settled.reduce((s, b) => s + (b.pnl ?? 0), 0);
  const clvs = bets.map((b) => b.clv).filter((c): c is number => c !== null);
  return {
    nBets: bets.length,
    nSettled: settled.length,
    staked,
    profit,
    yield: staked > 0 ? profit / staked : null,
    avgClv: clvs.length ? clvs.reduce((s, c) => s + c, 0) / clvs.length : null,
    positiveClvShare: clvs.length ? clvs.filter((c) => c > 0).length / clvs.length : null,
    nClv: clvs.length,
    hitRate: settled.length ? settled.filter((b) => b.status === "won").length / settled.length : null,
  };
}

export const ODDS_RANGES: [string, number, number][] = [
  ["< 1.80", 0, 1.8],
  ["1.80–2.49", 1.8, 2.5],
  ["2.50–3.99", 2.5, 4],
  ["≥ 4.00", 4, Infinity],
];

export function groupBy(bets: BetRow[], key: (b: BetRow) => string): { key: string; agg: Aggregate }[] {
  const groups = new Map<string, BetRow[]>();
  for (const b of bets) groups.set(key(b), [...(groups.get(key(b)) ?? []), b]);
  return [...groups].map(([k, g]) => ({ key: k, agg: aggregate(g) })).sort((a, b) => b.agg.nBets - a.agg.nBets);
}

export const oddsRange = (b: BetRow) => ODDS_RANGES.find(([, lo, hi]) => b.odds_taken >= lo && b.odds_taken < hi)![0];

/** Cumulative profit after each settled bet, chronological. */
export function profitCurve(bets: BetRow[]): { date: string; profit: number }[] {
  let cum = 0;
  return bets
    .filter((b) => b.pnl !== null && b.status !== "pending")
    .sort((a, b) => a.placed_at.localeCompare(b.placed_at))
    .map((b) => ({ date: b.placed_at, profit: (cum += b.pnl ?? 0) }));
}
