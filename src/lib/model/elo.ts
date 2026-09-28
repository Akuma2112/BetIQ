import { minimize, numericGradient } from "./optimizer";

/**
 * Elo ratings (second, independent signal) + an ordered-logit draw model that turns
 * a rating difference into P(home/draw/away). Pure.
 */

export interface EloMatch {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  season: string;
}

export interface EloConfig {
  k: number;
  homeAdv: number;
  /** Share of the distance to the mean kept across a season change. */
  seasonCarry: number;
  /** Rating given to a team first seen (typically a promoted side). */
  newTeamRating: number;
}

export const DEFAULT_ELO: EloConfig = { k: 20, homeAdv: 60, seasonCarry: 0.8, newTeamRating: 1420 };

export interface EloState {
  ratings: Record<string, number>;
  season: string | null;
}

export const emptyElo = (): EloState => ({ ratings: {}, season: null });

function goalMultiplier(goalDiff: number): number {
  const d = Math.abs(goalDiff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

/** Pre-match rating difference (home − away, including home advantage). */
export function eloDiff(state: EloState, home: string, away: string, cfg: EloConfig = DEFAULT_ELO): number {
  return (state.ratings[home] ?? cfg.newTeamRating) + cfg.homeAdv - (state.ratings[away] ?? cfg.newTeamRating);
}

/** Returns a new state after one match (matches must be fed chronologically). */
export function eloUpdate(state: EloState, m: EloMatch, cfg: EloConfig = DEFAULT_ELO): EloState {
  let ratings = state.ratings;
  if (state.season !== null && state.season !== m.season) {
    const values = Object.values(ratings);
    const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
    ratings = Object.fromEntries(Object.entries(ratings).map(([t, r]) => [t, mean + (r - mean) * cfg.seasonCarry]));
  }
  const rh = ratings[m.home] ?? cfg.newTeamRating;
  const ra = ratings[m.away] ?? cfg.newTeamRating;
  const expected = 1 / (1 + 10 ** (-(rh + cfg.homeAdv - ra) / 400));
  const score = m.homeGoals > m.awayGoals ? 1 : m.homeGoals === m.awayGoals ? 0.5 : 0;
  const delta = cfg.k * goalMultiplier(m.homeGoals - m.awayGoals) * (score - expected);
  return { season: m.season, ratings: { ...ratings, [m.home]: rh + delta, [m.away]: ra - delta } };
}

// ---------------------------------------------------------------------------
// Ordered logit: latent = b·d; P(away) = σ(c1 − b·d), P(away ∪ draw) = σ(c2 − b·d)
// ---------------------------------------------------------------------------

export interface DrawModel {
  b: number;
  c1: number;
  c2: number;
}

// Sensible prior when there's too little data to fit.
export const DEFAULT_DRAW_MODEL: DrawModel = { b: 0.0055, c1: -0.62, c2: 0.55 };

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function eloProbs(diff: number, dm: DrawModel): { home: number; draw: number; away: number } {
  const pAway = sigmoid(dm.c1 - dm.b * diff);
  const pAwayOrDraw = sigmoid(dm.c2 - dm.b * diff);
  return { home: 1 - pAwayOrDraw, draw: Math.max(pAwayOrDraw - pAway, 1e-6), away: pAway };
}

export type Result = "home" | "draw" | "away";

/** Fit (b, c1, c2) by maximum likelihood on (pre-match diff, result) pairs. */
export function fitDrawModel(samples: { diff: number; result: Result }[]): DrawModel {
  if (samples.length < 50) return DEFAULT_DRAW_MODEL;
  // Parametrise as [b·100, c1, log(c2 − c1)] so c2 > c1 always and scales are comparable.
  const decode = (x: Float64Array): DrawModel => ({ b: x[0] / 100, c1: x[1], c2: x[1] + Math.exp(x[2]) });
  const nll = (x: Float64Array) => {
    const dm = decode(x);
    let s = 0;
    for (const { diff, result } of samples) s -= Math.log(Math.max(eloProbs(diff, dm)[result], 1e-12));
    return s;
  };
  const x0 = Float64Array.from([
    DEFAULT_DRAW_MODEL.b * 100,
    DEFAULT_DRAW_MODEL.c1,
    Math.log(DEFAULT_DRAW_MODEL.c2 - DEFAULT_DRAW_MODEL.c1),
  ]);
  const res = minimize((x) => ({ f: nll(x), g: numericGradient(nll, x, 1e-5) }), x0, { maxIter: 200 });
  return decode(res.x);
}
