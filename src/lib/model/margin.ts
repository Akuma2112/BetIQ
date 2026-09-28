/** Remove the bookmaker margin from a set of decimal odds covering all outcomes. Pure. */

export function overround(odds: number[]): number {
  return odds.reduce((s, o) => s + 1 / o, 0);
}

/** Proportional (basic normalisation): p_i = (1/o_i) / Σ(1/o). */
export function devigProportional(odds: number[]): number[] {
  const b = overround(odds);
  return odds.map((o) => 1 / o / b);
}

/**
 * Shin (1993) method: models the margin as protection against insiders, which
 * shades longshots more than favourites (favourite-longshot bias). Solves for the
 * insider share z so that the implied probabilities sum to 1.
 */
export function devigShin(odds: number[]): { probs: number[]; z: number } {
  const q = odds.map((o) => 1 / o);
  const b = q.reduce((s, v) => s + v, 0);
  if (b <= 1) return { probs: q.map((v) => v / b), z: 0 }; // no margin (or arbitrage): nothing to remove
  const probsFor = (z: number) => q.map((qi) => (Math.sqrt(z * z + (4 * (1 - z) * qi * qi) / b) - z) / (2 * (1 - z)));
  const sum = (z: number) => probsFor(z).reduce((s, v) => s + v, 0) - 1;
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) > 0) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;
  const probs = probsFor(z);
  const total = probs.reduce((s, v) => s + v, 0);
  return { probs: probs.map((p) => p / total), z };
}
