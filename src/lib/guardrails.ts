/**
 * Responsible-gambling guardrails. Non-negotiable: callers must route every suggested
 * and logged stake through these functions. Pure.
 */

export type BetStatus = "pending" | "won" | "lost" | "void";

export interface GuardInput {
  bankroll: number;
  monthlyBudget: number;
  maxStakePct: number;
  lossStreakWarning: number;
  /** Sum of stakes placed this calendar month (pending + settled). */
  stakedThisMonth: number;
  /** P&L of all settled bets. */
  realizedPnl: number;
  /** Settled results, most recent first (void ignored). */
  recentResults: BetStatus[];
}

export interface GuardState {
  budgetRemaining: number;
  budgetReached: boolean;
  /** Never above the configured bankroll → winning never inflates stakes; losing shrinks them. */
  effectiveBankroll: number;
  maxStake: number;
  lossStreak: number;
  pauseSuggested: boolean;
}

export function evaluateGuards(s: GuardInput): GuardState {
  const budgetRemaining = Math.max(0, s.monthlyBudget - s.stakedThisMonth);
  const effectiveBankroll = Math.max(0, Math.min(s.bankroll, s.bankroll + s.realizedPnl));
  let lossStreak = 0;
  for (const r of s.recentResults) {
    if (r === "void" || r === "pending") continue;
    if (r !== "lost") break;
    lossStreak++;
  }
  return {
    budgetRemaining,
    budgetReached: budgetRemaining <= 0,
    effectiveBankroll,
    maxStake: Math.floor(effectiveBankroll * s.maxStakePct * 10) / 10,
    lossStreak,
    pauseSuggested: lossStreak >= s.lossStreakWarning,
  };
}

/** Clamp a model-suggested stake: 0 when the budget is spent, never above the per-bet cap or what's left of the budget. */
export function guardStake(stake: number, g: GuardState): number {
  if (g.budgetReached || stake <= 0) return 0;
  return Math.floor(Math.min(stake, g.maxStake, g.budgetRemaining) * 10) / 10;
}

/** Server-side validation when logging a bet. Returns a French error message, or null if OK. */
export function validateStake(stake: number, g: GuardState): string | null {
  if (!Number.isFinite(stake) || stake <= 0) return "Mise invalide.";
  if (g.budgetReached) return "Budget mensuel atteint : aucun nouveau pari ce mois-ci.";
  if (stake > g.maxStake + 1e-9) return `Mise plafonnée à ${g.maxStake.toFixed(2)} € (max par pari).`;
  if (stake > g.budgetRemaining + 1e-9) return `Il ne reste que ${g.budgetRemaining.toFixed(2)} € de budget ce mois-ci.`;
  return null;
}
