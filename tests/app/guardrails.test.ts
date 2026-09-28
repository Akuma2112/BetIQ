import { describe, expect, it } from "vitest";
import { evaluateGuards, guardStake, validateStake, type GuardInput } from "@/lib/guardrails";
import { buildPicks, type LatestOdd } from "@/lib/picks";
import { aggregate, betPnl, oddsRange, profitCurve, type BetRow } from "@/lib/stats";

const base: GuardInput = {
  bankroll: 1000,
  monthlyBudget: 200,
  maxStakePct: 0.02,
  lossStreakWarning: 5,
  stakedThisMonth: 0,
  realizedPnl: 0,
  recentResults: [],
};

describe("guardrails", () => {
  it("monthly budget reached → stakes are 0 and logging is refused", () => {
    const g = evaluateGuards({ ...base, stakedThisMonth: 200 });
    expect(g.budgetReached).toBe(true);
    expect(guardStake(15, g)).toBe(0);
    expect(validateStake(5, g)).toMatch(/Budget mensuel atteint/);
  });

  it("stake never exceeds 2% of bankroll nor the remaining budget", () => {
    const g = evaluateGuards(base);
    expect(g.maxStake).toBe(20);
    expect(guardStake(50, g)).toBe(20);
    expect(validateStake(25, g)).toMatch(/plafonnée/);
    const low = evaluateGuards({ ...base, stakedThisMonth: 190 });
    expect(guardStake(20, low)).toBe(10);
    expect(validateStake(15, low)).toMatch(/reste/);
    expect(validateStake(10, low)).toBeNull();
  });

  it("no chasing: winnings never raise the bankroll used for stakes, losses lower it", () => {
    expect(evaluateGuards({ ...base, realizedPnl: 500 }).effectiveBankroll).toBe(1000);
    expect(evaluateGuards({ ...base, realizedPnl: -300 }).effectiveBankroll).toBe(700);
    expect(evaluateGuards({ ...base, realizedPnl: -300 }).maxStake).toBe(14);
  });

  it("5 consecutive losses → pause suggested (voids ignored, a win resets)", () => {
    const five = evaluateGuards({ ...base, recentResults: ["lost", "lost", "void", "lost", "lost", "lost", "won"] });
    expect(five.lossStreak).toBe(5);
    expect(five.pauseSuggested).toBe(true);
    const reset = evaluateGuards({ ...base, recentResults: ["lost", "won", "lost", "lost", "lost", "lost"] });
    expect(reset.lossStreak).toBe(1);
    expect(reset.pauseSuggested).toBe(false);
  });
});

describe("buildPicks", () => {
  const prediction = { p_home: 0.5, p_draw: 0.27, p_away: 0.23, p_over_2_5: 0.55, p_btts: 0.52 };
  const at = "2026-10-03T08:00:00Z";
  const odds: LatestOdd[] = [
    { bookmaker: "pinnacle", market: "h2h", outcome: "home", price: 2.0, capturedAt: at },
    { bookmaker: "pinnacle", market: "h2h", outcome: "draw", price: 3.6, capturedAt: at },
    { bookmaker: "pinnacle", market: "h2h", outcome: "away", price: 4.2, capturedAt: at },
    { bookmaker: "winamax_fr", market: "h2h", outcome: "home", price: 2.25, capturedAt: at },
    { bookmaker: "betclic_fr", market: "h2h", outcome: "home", price: 2.1, capturedAt: at },
    { bookmaker: "betclic_fr", market: "h2h", outcome: "away", price: 3.9, capturedAt: at },
    // Not a French book: must be ignored for best odds
    { bookmaker: "betfair_ex", market: "h2h", outcome: "draw", price: 5.0, capturedAt: at },
  ];
  const settings = { kellyFraction: 0.25, maxStakePct: 0.02, valueThreshold: 0.05, modelWeight: 0 };
  const guards = evaluateGuards(base);

  it("uses the sharp de-margined probability when model weight is 0, best FR odds only", () => {
    const picks = buildPicks(prediction, odds, settings, guards);
    const home = picks.find((p) => p.outcome === "home")!;
    expect(home.bestBook).toBe("winamax_fr");
    expect(home.bestOdds).toBe(2.25);
    expect(home.prob).toBeCloseTo(home.marketProb!, 12);
    expect(home.value).toBeCloseTo(home.marketProb! * 2.25 - 1, 12);
    expect(home.isValue).toBe(true);
    expect(home.stake).toBeGreaterThan(0);
    expect(home.stake).toBeLessThanOrEqual(20);
    const draw = picks.find((p) => p.outcome === "draw")!;
    expect(draw.bestOdds).toBeNull();
    expect(draw.stake).toBe(0);
  });

  it("without a sharp reference and w < 1, no probability → no pick", () => {
    const over = buildPicks(prediction, odds, settings, guards).find((p) => p.outcome === "over")!;
    expect(over.prob).toBeNull();
    expect(over.isValue).toBe(false);
  });

  it("model weight 1 uses the model probability", () => {
    const home = buildPicks(prediction, odds, { ...settings, modelWeight: 1 }, guards).find((p) => p.outcome === "home")!;
    expect(home.prob).toBe(0.5);
  });

  it("budget reached zeroes every stake", () => {
    const picks = buildPicks(prediction, odds, settings, evaluateGuards({ ...base, stakedThisMonth: 999 }));
    expect(picks.every((p) => p.stake === 0)).toBe(true);
    expect(picks.some((p) => p.isValue)).toBe(true);
  });
});

describe("stats", () => {
  const bets: BetRow[] = [
    { id: 1, placed_at: "2026-09-01", league_id: "L1", market: "h2h", odds_taken: 2.1, stake: 10, status: "won", pnl: 11, clv: 0.03 },
    { id: 2, placed_at: "2026-09-02", league_id: "EPL", market: "totals_2_5", odds_taken: 1.9, stake: 10, status: "lost", pnl: -10, clv: -0.01 },
    { id: 3, placed_at: "2026-09-03", league_id: "L1", market: "h2h", odds_taken: 3.0, stake: 5, status: "pending", pnl: null, clv: null },
  ];
  it("P&L per status", () => {
    expect(betPnl("won", 10, 2.15)).toBe(11.5);
    expect(betPnl("lost", 10, 2)).toBe(-10);
    expect(betPnl("void", 10, 2)).toBe(0);
    expect(betPnl("pending", 10, 2)).toBeNull();
  });
  it("aggregates yield and CLV", () => {
    const a = aggregate(bets);
    expect(a.profit).toBe(1);
    expect(a.yield).toBeCloseTo(0.05);
    expect(a.avgClv).toBeCloseTo(0.01);
    expect(a.hitRate).toBe(0.5);
  });
  it("odds ranges and profit curve", () => {
    expect(oddsRange(bets[0])).toBe("1.80–2.49");
    expect(profitCurve(bets).map((p) => p.profit)).toEqual([11, 1]);
  });
});

describe("closingValue", () => {
  it("computes CLV vs the Shin-devigged sharp close", async () => {
    const { closingValue } = await import("@/lib/picks");
    const close = [
      { bookmaker: "pinnacle", market: "h2h" as const, outcome: "home" as const, price: 1.95, capturedAt: "" },
      { bookmaker: "pinnacle", market: "h2h" as const, outcome: "draw" as const, price: 3.7, capturedAt: "" },
      { bookmaker: "pinnacle", market: "h2h" as const, outcome: "away" as const, price: 4.3, capturedAt: "" },
    ];
    const r = closingValue(close, "h2h", "home", 2.1)!;
    expect(r.closingOdds).toBe(1.95);
    expect(r.clv).toBeGreaterThan(0.05);
    expect(r.clv).toBeLessThan(2.1 / 1.95 - 1 + 0.05);
    expect(closingValue(close, "totals_2_5", "over", 2)).toBeNull();
  });
});
