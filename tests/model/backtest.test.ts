import { describe, expect, it } from "vitest";
import { brier, calibration, downsample, logLoss, summarizeBets } from "@/lib/backtest/metrics";
import { walkForward, type BtMatch } from "@/lib/backtest/walk-forward";
import { DEFAULT_MODEL } from "@/lib/model/predict";

describe("metrics", () => {
  const rows = [
    { p: { home: 0.5, draw: 0.3, away: 0.2 }, y: "home" as const },
    { p: { home: 0.2, draw: 0.3, away: 0.5 }, y: "draw" as const },
  ];
  it("log-loss and Brier", () => {
    expect(logLoss(rows)).toBeCloseTo((-Math.log(0.5) - Math.log(0.3)) / 2, 10);
    expect(brier(rows)).toBeCloseTo((0.25 + 0.09 + 0.04 + (0.04 + 0.49 + 0.25)) / 2, 10);
  });
  it("calibration bins", () => {
    const bins = calibration([
      { p: 0.12, hit: false },
      { p: 0.18, hit: true },
      { p: 0.95, hit: true },
    ]);
    expect(bins).toHaveLength(2);
    expect(bins[0]).toMatchObject({ n: 2, observed: 0.5 });
    expect(bins[0].meanPred).toBeCloseTo(0.15);
  });
  it("bet summary: ROI, yield, drawdown", () => {
    const s = summarizeBets(
      [
        { date: "1", stake: 10, odds: 2, won: true, clv: 0.02 },
        { date: "2", stake: 10, odds: 2, won: false, clv: -0.01 },
        { date: "3", stake: 10, odds: 3, won: false, clv: null },
      ],
      100,
    );
    expect(s.profit).toBe(-10);
    expect(s.yield).toBeCloseTo(-10 / 30);
    expect(s.roi).toBeCloseTo(-0.1);
    expect(s.maxDrawdown).toBeCloseTo(20 / 110);
    expect(s.avgClv).toBeCloseTo(0.005);
    expect(s.positiveClvShare).toBe(0.5);
  });
  it("downsample keeps endpoints", () => {
    const d = downsample(Array.from({ length: 1000 }, (_, i) => i), 10);
    expect(d).toHaveLength(10);
    expect(d[0]).toBe(0);
    expect(d[9]).toBe(999);
  });
});

describe("walkForward — no look-ahead", () => {
  const teams = ["A", "B", "C", "D", "E", "F", "G", "H"];
  function season(startYear: number, scoreFn: (h: number, a: number, round: number) => [number, number]): BtMatch[] {
    const out: BtMatch[] = [];
    let day = 0;
    for (let round = 0; round < 2; round++)
      teams.forEach((h, i) =>
        teams.forEach((a, j) => {
          if (i === j) return;
          const [hg, ag] = scoreFn(i, j, round);
          out.push({
            league: "T",
            season: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
            home: h,
            away: a,
            homeGoals: hg,
            awayGoals: ag,
            kickoffAt: new Date(Date.UTC(startYear, 7, 1) + (day++ % 280) * 86400 * 1000),
            odds: [],
          });
        }),
      );
    return out;
  }
  const normal = (h: number, a: number, r: number): [number, number] => [(h * 7 + a * 3 + r) % 4, (a * 5 + h + r) % 3];

  it("predictions for a week don't change when later results change", () => {
    const history = [...season(2022, normal), ...season(2023, normal)];
    const cut = new Date(Date.UTC(2023, 9, 1));
    const from = new Date(Date.UTC(2023, 7, 1));
    const to = new Date(Date.UTC(2023, 8, 1));
    const tampered = history.map((m) => (m.kickoffAt >= cut ? { ...m, homeGoals: 9, awayGoals: 0 } : m));
    const a = walkForward(history, from, to, DEFAULT_MODEL);
    const b = walkForward(tampered, from, to, DEFAULT_MODEL);
    expect(a.length).toBeGreaterThan(0);
    expect(b.map((p) => p.dc)).toEqual(a.map((p) => p.dc));
    expect(b.map((p) => p.elo)).toEqual(a.map((p) => p.elo));
  });

  it("the match being predicted is never part of its own fit", () => {
    const history = [...season(2022, normal), ...season(2023, normal)];
    const from = new Date(Date.UTC(2023, 7, 1));
    const to = new Date(Date.UTC(2023, 7, 15));
    const target = history.find((m) => m.kickoffAt >= from && m.kickoffAt < to)!;
    const altered = history.map((m) => (m === target ? { ...m, homeGoals: 12, awayGoals: 0 } : m));
    const key = (p: { home: string; away: string; season: string }) => `${p.home}-${p.away}-${p.season}`;
    const pa = walkForward(history, from, to, DEFAULT_MODEL).find((p) => key(p) === key(target))!;
    const pb = walkForward(altered, from, to, DEFAULT_MODEL).find((p) => key(p) === key(target))!;
    expect(pb.dc).toEqual(pa.dc);
  });
});
