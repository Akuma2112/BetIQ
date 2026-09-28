export type Provider = "fd_org" | "odds_api" | "fdcouk" | "anthropic";

export interface ApiCallMeta {
  provider: Provider;
  endpoint: string;
  httpStatus: number;
  creditsUsed: number;
  creditsRemaining: number | null;
}

export interface QuotaState {
  monthlyCredits: number;
  /** Latest `x-requests-remaining` seen this month, if any. */
  lastRemaining: number | null;
  /** Credits logged in api_usage since the start of the month. */
  usedThisMonth: number;
}

/** Hard stop: never let an odds job push usage past `maxShare` of the monthly quota. */
export function canSpend(state: QuotaState, cost: number, maxShare = 0.95): boolean {
  const reserve = state.monthlyCredits * (1 - maxShare);
  const remaining = state.lastRemaining ?? state.monthlyCredits - state.usedThisMonth;
  return remaining - cost >= reserve;
}
