/** Value, blending and stake sizing. Pure. */

export interface ThreeWay {
  home: number;
  draw: number;
  away: number;
}

/** Weighted average of two 1X2 distributions, renormalised. wA ∈ [0, 1]. */
export function blend(a: ThreeWay, b: ThreeWay, wA: number): ThreeWay {
  const w = Math.min(1, Math.max(0, wA));
  const home = w * a.home + (1 - w) * b.home;
  const draw = w * a.draw + (1 - w) * b.draw;
  const away = w * a.away + (1 - w) * b.away;
  const s = home + draw + away;
  return { home: home / s, draw: draw / s, away: away / s };
}

/** Expected value per unit staked: p·odds − 1. */
export function value(prob: number, odds: number): number {
  return prob * odds - 1;
}

/** Full-Kelly fraction of bankroll (0 if no edge). */
export function kellyFraction(prob: number, odds: number): number {
  if (odds <= 1) return 0;
  return Math.max(0, (prob * odds - 1) / (odds - 1));
}

export interface StakeInput {
  prob: number;
  odds: number;
  bankroll: number;
  /** Fraction of Kelly to use (default 0.25). */
  kellyMultiplier?: number;
  /** Hard cap as share of bankroll (default 0.02). */
  maxStakePct?: number;
}

/** Fractional Kelly, capped at maxStakePct of bankroll, rounded down to 0.10. Never negative. */
export function suggestedStake({ prob, odds, bankroll, kellyMultiplier = 0.25, maxStakePct = 0.02 }: StakeInput): number {
  if (bankroll <= 0) return 0;
  const f = Math.min(kellyFraction(prob, odds) * kellyMultiplier, maxStakePct);
  return Math.floor(f * bankroll * 10) / 10;
}

/** Raw closing-line value vs the sharp closing price (margin included): odds_taken / closing − 1. */
export function clv(oddsTaken: number, closingOdds: number): number {
  return oddsTaken / closingOdds - 1;
}

/**
 * CLV against the de-margined sharp closing probability: odds_taken · p_close − 1.
 * This is the best available estimate of the true EV of a bet taken — the metric that matters.
 */
export function clvFair(oddsTaken: number, fairCloseProb: number): number {
  return oddsTaken * fairCloseProb - 1;
}
