import { describe, expect, it } from "vitest";
import { blend, clv, clvFair, kellyFraction, suggestedStake, value } from "@/lib/model/betting";
import { dcObjective, dcPredict, fitDixonColes, type DcMatch } from "@/lib/model/dixon-coles";
import { DEFAULT_DRAW_MODEL, eloDiff, eloProbs, eloUpdate, emptyElo, fitDrawModel } from "@/lib/model/elo";
import { devigProportional, devigShin, overround } from "@/lib/model/margin";
import { minimize, numericGradient } from "@/lib/model/optimizer";
import { dcTau, marketsFromMatrix, poissonPmf, scoreMatrix } from "@/lib/model/poisson";

/** Deterministic PRNG so simulations are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function samplePoisson(lambda: number, rand: () => number) {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

describe("poisson / score matrix", () => {
  it("pmf sums to ~1 and matches known values", () => {
    expect(poissonPmf(0, 1.5)).toBeCloseTo(Math.exp(-1.5), 12);
    expect(poissonPmf(2, 1.5)).toBeCloseTo((1.5 ** 2 * Math.exp(-1.5)) / 2, 12);
    const s = Array.from({ length: 30 }, (_, k) => poissonPmf(k, 2.3)).reduce((a, b) => a + b);
    expect(s).toBeCloseTo(1, 10);
  });

  it("τ only touches the four low scores", () => {
    expect(dcTau(0, 0, 1.4, 1.1, -0.1)).toBeCloseTo(1 + 1.4 * 1.1 * 0.1);
    expect(dcTau(1, 1, 1.4, 1.1, -0.1)).toBeCloseTo(1.1);
    expect(dcTau(2, 1, 1.4, 1.1, -0.1)).toBe(1);
  });

  it("market probabilities are coherent", () => {
    const m = marketsFromMatrix(scoreMatrix(1.6, 1.1, -0.08));
    expect(m.home + m.draw + m.away).toBeCloseTo(1, 10);
    expect(m.over25 + m.under25).toBeCloseTo(1, 10);
    expect(m.home).toBeGreaterThan(m.away);
    // negative ρ inflates draws vs independent Poisson
    expect(m.draw).toBeGreaterThan(marketsFromMatrix(scoreMatrix(1.6, 1.1, 0)).draw);
  });

  it("symmetric teams without home edge → P(home) = P(away)", () => {
    const m = marketsFromMatrix(scoreMatrix(1.3, 1.3, 0));
    expect(m.home).toBeCloseTo(m.away, 10);
  });
});

describe("optimizer", () => {
  it("minimises the Rosenbrock function", () => {
    const res = minimize((x) => {
      const [a, b] = x;
      return {
        f: (1 - a) ** 2 + 100 * (b - a * a) ** 2,
        g: Float64Array.from([-2 * (1 - a) - 400 * a * (b - a * a), 200 * (b - a * a)]),
      };
    }, [-1.2, 1]);
    expect(res.x[0]).toBeCloseTo(1, 4);
    expect(res.x[1]).toBeCloseTo(1, 4);
  });
});

describe("Dixon-Coles", () => {
  const teams = ["A", "B", "C", "D", "E", "F"];
  const trueAtt: Record<string, number> = { A: 0.45, B: 0.2, C: 0.05, D: -0.1, E: -0.25, F: -0.35 };
  const trueDef: Record<string, number> = { A: 0.35, B: 0.15, C: 0, D: -0.05, E: -0.2, F: -0.25 };
  const mu = 0.15;
  const home = 0.25;

  function simulate(rounds: number, seed = 42): DcMatch[] {
    const rand = mulberry32(seed);
    const out: DcMatch[] = [];
    for (let r = 0; r < rounds; r++)
      for (const h of teams)
        for (const a of teams) {
          if (h === a) continue;
          const lh = Math.exp(mu + home + trueAtt[h] - trueDef[a]);
          const la = Math.exp(mu + trueAtt[a] - trueDef[h]);
          out.push({ home: h, away: a, homeGoals: samplePoisson(lh, rand), awayGoals: samplePoisson(la, rand), ageDays: 0 });
        }
    return out;
  }

  it("analytic gradient matches finite differences", () => {
    const matches = simulate(2).map((m, i) => ({ ...m, ageDays: i }));
    const obj = dcObjective(matches, teams, { xi: 0.002, ridge: 0.5 });
    const x = Float64Array.from({ length: 3 + 2 * teams.length }, (_, i) => (i === 2 ? -0.05 : 0.1 * Math.sin(i + 1)));
    const { g } = obj(x);
    const num = numericGradient((v) => obj(v).f, x);
    for (let i = 0; i < g.length; i++) expect(g[i]).toBeCloseTo(num[i], 4);
  });

  it("recovers the generating parameters on simulated data", () => {
    const fit = fitDixonColes(simulate(150), { xi: 0, ridge: 0.01 });
    expect(fit.converged).toBe(true);
    expect(fit.homeAdv).toBeCloseTo(home, 1);
    // att/def are identified up to a shift absorbed by μ — compare centred values
    const centred = (r: Record<string, number>) => {
      const m = teams.reduce((s, t) => s + r[t], 0) / teams.length;
      return teams.map((t) => r[t] - m);
    };
    const fa = centred(fit.attack);
    const ta = centred(trueAtt);
    const fd = centred(fit.defence);
    const td = centred(trueDef);
    teams.forEach((_, i) => {
      expect(Math.abs(fa[i] - ta[i])).toBeLessThan(0.08);
      expect(Math.abs(fd[i] - td[i])).toBeLessThan(0.08);
    });
    expect(Math.abs(fit.rho)).toBeLessThan(0.1); // data generated with ρ = 0
  });

  it("predicts the stronger team as favourite and time decay down-weights old games", () => {
    const fit = fitDixonColes(simulate(10), { ridge: 0.5 });
    const p = dcPredict(fit, "A", "F");
    expect(p.home).toBeGreaterThan(0.6);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 8);

    // Old games say B >> A (home and away), recent games say A >> B; with decay the recent form wins.
    const games = (winner: string, loser: string, ageDays: number): DcMatch[] =>
      Array.from({ length: 10 }, () => [
        { home: winner, away: loser, homeGoals: 3, awayGoals: 0, ageDays },
        { home: loser, away: winner, homeGoals: 0, awayGoals: 2, ageDays },
      ]).flat();
    const old = games("B", "A", 900);
    const recent = games("A", "B", 10);
    const decayed = fitDixonColes([...old, ...recent], { xi: 0.005, ridge: 0.1 });
    expect(decayed.attack.A).toBeGreaterThan(decayed.attack.B);
  });

  it("unknown teams fall back to league average", () => {
    const fit = fitDixonColes(simulate(5));
    const p = dcPredict(fit, "Newcomer", "Other");
    expect(p.lambdaHome).toBeCloseTo(Math.exp(fit.mu + fit.homeAdv), 8);
  });
});

describe("Elo", () => {
  it("winner gains exactly what loser drops, bigger margins move more", () => {
    const s0 = emptyElo();
    const s1 = eloUpdate(s0, { home: "A", away: "B", homeGoals: 1, awayGoals: 0, season: "2024-25" });
    const s2 = eloUpdate(s0, { home: "A", away: "B", homeGoals: 4, awayGoals: 0, season: "2024-25" });
    expect(s1.ratings.A - 1420).toBeCloseTo(1420 - s1.ratings.B, 10);
    expect(s2.ratings.A).toBeGreaterThan(s1.ratings.A);
  });

  it("regresses toward the mean between seasons", () => {
    let s = { ratings: { A: 1700, B: 1300 }, season: "2024-25" };
    s = eloUpdate(s, { home: "A", away: "B", homeGoals: 1, awayGoals: 1, season: "2025-26" });
    expect(s.ratings.A).toBeLessThan(1700 - 40); // 1700 → 1660 after carry, then a draw
  });

  it("draw model gives coherent, monotone probabilities", () => {
    const low = eloProbs(-200, DEFAULT_DRAW_MODEL);
    const high = eloProbs(300, DEFAULT_DRAW_MODEL);
    expect(low.home + low.draw + low.away).toBeCloseTo(1, 10);
    expect(high.home).toBeGreaterThan(low.home);
    expect(high.away).toBeLessThan(low.away);
    expect(eloDiff(emptyElo(), "X", "Y")).toBe(60);
  });

  it("fits a draw model that reproduces the empirical draw rate", () => {
    const rand = mulberry32(7);
    const samples = Array.from({ length: 3000 }, () => {
      const diff = (rand() - 0.5) * 600;
      const truth = eloProbs(diff, { b: 0.006, c1: -0.5, c2: 0.6 });
      const u = rand();
      return { diff, result: (u < truth.away ? "away" : u < truth.away + truth.draw ? "draw" : "home") as "home" | "draw" | "away" };
    });
    const dm = fitDrawModel(samples);
    expect(dm.b).toBeCloseTo(0.006, 3);
    expect(dm.c1).toBeCloseTo(-0.5, 0);
    expect(dm.c2).toBeCloseTo(0.6, 0);
  });
});

describe("margin removal", () => {
  const odds = [1.5, 4.4, 7.0];
  it("proportional sums to 1", () => {
    expect(devigProportional(odds).reduce((a, b) => a + b)).toBeCloseTo(1, 12);
    expect(overround(odds)).toBeGreaterThan(1);
  });
  it("Shin sums to 1, shades the longshot more than proportional", () => {
    const { probs, z } = devigShin(odds);
    const prop = devigProportional(odds);
    expect(probs.reduce((a, b) => a + b)).toBeCloseTo(1, 10);
    expect(z).toBeGreaterThan(0);
    expect(probs[0]).toBeGreaterThan(prop[0]); // favourite
    expect(probs[2]).toBeLessThan(prop[2]); // longshot
  });
  it("Shin on fair odds is a no-op", () => {
    const { probs, z } = devigShin([2, 4, 4]);
    expect(z).toBe(0);
    expect(probs).toEqual([0.5, 0.25, 0.25]);
  });
});

describe("betting maths", () => {
  it("value and Kelly", () => {
    expect(value(0.55, 2)).toBeCloseTo(0.1);
    expect(kellyFraction(0.55, 2)).toBeCloseTo(0.1);
    expect(kellyFraction(0.4, 2)).toBe(0);
  });
  it("stake = fractional Kelly, capped at 2% of bankroll", () => {
    // Kelly 10% × 0.25 = 2.5% → capped at 2%
    expect(suggestedStake({ prob: 0.55, odds: 2, bankroll: 1000 })).toBe(20);
    // Kelly 4% × 0.25 = 1%
    expect(suggestedStake({ prob: 0.52, odds: 2, bankroll: 1000 })).toBe(10);
    expect(suggestedStake({ prob: 0.3, odds: 2, bankroll: 1000 })).toBe(0);
    expect(suggestedStake({ prob: 0.9, odds: 2, bankroll: 0 })).toBe(0);
  });
  it("blend is a normalised weighted average", () => {
    const b = blend({ home: 0.5, draw: 0.3, away: 0.2 }, { home: 0.3, draw: 0.3, away: 0.4 }, 0.7);
    expect(b.home).toBeCloseTo(0.44);
    expect(b.home + b.draw + b.away).toBeCloseTo(1);
  });
  it("CLV", () => {
    expect(clv(2.1, 2.0)).toBeCloseTo(0.05);
    expect(clvFair(2.1, 0.5)).toBeCloseTo(0.05);
  });
});
