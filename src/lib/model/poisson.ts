/** Poisson score model with the Dixon-Coles low-score correction. Pure. */

export const MAX_GOALS = 10;

export function poissonPmf(k: number, lambda: number): number {
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** Dixon-Coles τ adjustment for scores 0-0, 1-0, 0-1, 1-1 (1 elsewhere). */
export function dcTau(homeGoals: number, awayGoals: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

/** matrix[i][j] = P(home scores i, away scores j), i, j ∈ [0, MAX_GOALS], normalised to sum 1. */
export function scoreMatrix(lambdaHome: number, lambdaAway: number, rho = 0, maxGoals = MAX_GOALS): number[][] {
  const ph = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, lambdaHome));
  const pa = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, lambdaAway));
  let total = 0;
  const m = ph.map((phi, i) =>
    pa.map((paj, j) => {
      const p = Math.max(0, dcTau(i, j, lambdaHome, lambdaAway, rho) * phi * paj);
      total += p;
      return p;
    }),
  );
  return m.map((row) => row.map((p) => p / total));
}

export interface MarketProbs {
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  bttsYes: number;
  bttsNo: number;
}

export function marketsFromMatrix(m: number[][]): MarketProbs {
  let home = 0, draw = 0, away = 0, under25 = 0, bttsNo = 0;
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      const p = m[i][j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i + j <= 2) under25 += p;
      if (i === 0 || j === 0) bttsNo += p;
    }
  }
  return { home, draw, away, over25: 1 - under25, under25, bttsYes: 1 - bttsNo, bttsNo };
}
