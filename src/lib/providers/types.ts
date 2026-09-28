export type Market = "h2h" | "totals_2_5" | "btts";
export type Outcome = "home" | "draw" | "away" | "over" | "under" | "yes" | "no";

export interface OddsQuote {
  bookmaker: string;
  market: Market;
  outcome: Outcome;
  price: number;
  isClosing: boolean;
  capturedAt: Date;
}

/** Books where a French resident can legally bet (ANJ-licensed). "Best odds" only looks at these. */
export const FR_LICENSED_BOOKS = ["winamax_fr", "betclic_fr", "unibet_fr", "pmu_fr", "netbet_fr"] as const;

/** Sharp references for fair probability and CLV, in order of preference. */
export const SHARP_BOOKS = ["pinnacle", "betfair_ex"] as const;
