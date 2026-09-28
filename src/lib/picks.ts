import { guardStake, type GuardState } from "./guardrails";
import { suggestedStake, value } from "./model/betting";
import { devigShin } from "./model/margin";
import { FR_LICENSED_BOOKS, SHARP_BOOKS, type Market, type Outcome } from "./providers/types";

/** Turns a stored prediction + latest odds + settings into displayable picks. Pure. */

export interface LatestOdd {
  bookmaker: string;
  market: Market;
  outcome: Outcome;
  price: number;
  capturedAt: string;
}

export interface PredictionRow {
  p_home: number;
  p_draw: number;
  p_away: number;
  p_over_2_5: number;
  p_btts: number;
}

export interface PickSettings {
  kellyFraction: number;
  maxStakePct: number;
  valueThreshold: number;
  /** Probability used for value = w·model + (1 − w)·sharp market. */
  modelWeight: number;
}

export interface Pick {
  market: Market;
  outcome: Outcome;
  label: string;
  modelProb: number;
  /** De-margined sharp probability (Shin), null if no sharp quote. */
  marketProb: number | null;
  sharpBook: string | null;
  /** Probability the value calc uses. null when it can't be formed (no sharp ref and w < 1). */
  prob: number | null;
  bestOdds: number | null;
  bestBook: string | null;
  value: number | null;
  stake: number;
  isValue: boolean;
}

const OUTCOMES: Record<Market, Outcome[]> = { h2h: ["home", "draw", "away"], totals_2_5: ["over", "under"], btts: ["yes", "no"] };
const LABELS: Record<Outcome, string> = { home: "1", draw: "N", away: "2", over: "+2.5", under: "−2.5", yes: "BTTS oui", no: "BTTS non" };

export const BOOK_LABELS: Record<string, string> = {
  winamax_fr: "Winamax",
  betclic_fr: "Betclic",
  unibet_fr: "Unibet",
  pmu_fr: "PMU",
  netbet_fr: "NetBet",
  pinnacle: "Pinnacle",
  betfair_ex: "Betfair Ex.",
};

function modelProbs(p: PredictionRow): Record<Outcome, number> {
  return { home: p.p_home, draw: p.p_draw, away: p.p_away, over: p.p_over_2_5, under: 1 - p.p_over_2_5, yes: p.p_btts, no: 1 - p.p_btts };
}

export function sharpFair(odds: LatestOdd[], market: Market): { probs: Partial<Record<Outcome, number>>; book: string } | null {
  for (const book of SHARP_BOOKS) {
    const quotes = OUTCOMES[market].map((o) => odds.find((q) => q.bookmaker === book && q.market === market && q.outcome === o)?.price);
    if (quotes.every((q): q is number => q !== undefined)) {
      const { probs } = devigShin(quotes);
      return { probs: Object.fromEntries(OUTCOMES[market].map((o, i) => [o, probs[i]])), book };
    }
  }
  return null;
}

export function buildPicks(prediction: PredictionRow, odds: LatestOdd[], settings: PickSettings, guards: GuardState): Pick[] {
  const model = modelProbs(prediction);
  const w = settings.modelWeight;
  const picks: Pick[] = [];
  for (const market of Object.keys(OUTCOMES) as Market[]) {
    const sharp = sharpFair(odds, market);
    for (const outcome of OUTCOMES[market]) {
      const marketProb = sharp?.probs[outcome] ?? null;
      const prob = marketProb === null ? (w >= 1 ? model[outcome] : null) : w * model[outcome] + (1 - w) * marketProb;
      let bestOdds: number | null = null;
      let bestBook: string | null = null;
      for (const q of odds) {
        if (q.market !== market || q.outcome !== outcome) continue;
        if (!(FR_LICENSED_BOOKS as readonly string[]).includes(q.bookmaker)) continue;
        if (bestOdds === null || q.price > bestOdds) {
          bestOdds = q.price;
          bestBook = q.bookmaker;
        }
      }
      const v = prob !== null && bestOdds !== null ? value(prob, bestOdds) : null;
      const isValue = v !== null && v >= settings.valueThreshold;
      const raw = isValue
        ? suggestedStake({ prob: prob!, odds: bestOdds!, bankroll: guards.effectiveBankroll, kellyMultiplier: settings.kellyFraction, maxStakePct: settings.maxStakePct })
        : 0;
      picks.push({
        market,
        outcome,
        label: LABELS[outcome],
        modelProb: model[outcome],
        marketProb,
        sharpBook: sharp?.book ?? null,
        prob,
        bestOdds,
        bestBook,
        value: v,
        stake: guardStake(raw, guards),
        isValue,
      });
    }
  }
  return picks;
}

/**
 * CLV of a taken price vs the sharp closing line for the same outcome:
 * odds_taken × p_close(Shin) − 1. Null when no complete sharp closing market exists.
 */
export function closingValue(closing: LatestOdd[], market: Market, outcome: Outcome, oddsTaken: number): { closingOdds: number; clv: number } | null {
  const fair = sharpFair(closing, market);
  const p = fair?.probs[outcome];
  if (!fair || p === undefined) return null;
  const closingOdds = closing.find((q) => q.bookmaker === fair.book && q.market === market && q.outcome === outcome)!.price;
  return { closingOdds, clv: oddsTaken * p - 1 };
}
