import { minimize } from "./optimizer";
import { dcTau, marketsFromMatrix, scoreMatrix, type MarketProbs } from "./poisson";

/**
 * Dixon-Coles (1997): independent Poisson goals with a low-score correction ρ and
 * exponential time-decay weights w = exp(-ξ · ageDays).
 *
 *   log λ_home = μ + h + att[home] − def[away]
 *   log λ_away = μ     + att[away] − def[home]
 *
 * att/def carry a ridge penalty toward a per-team prior (0 = league average), which
 * both identifies the model and shrinks teams with little data (e.g. promoted sides).
 */

export interface DcMatch {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  /** Days between this match and the fit date (≥ 0). */
  ageDays: number;
}

export interface DcOptions {
  /** Time decay per day. 0.0019 ≈ half-life of ~1 year. */
  xi?: number;
  /** Ridge strength on att/def, in units of weighted log-likelihood. */
  ridge?: number;
  /** Prior centre for att/def per team (default 0). */
  priors?: Record<string, { att: number; def: number }>;
}

export interface DcParams {
  teams: string[];
  attack: Record<string, number>;
  defence: Record<string, number>;
  mu: number;
  homeAdv: number;
  rho: number;
  xi: number;
  logLik: number;
  nMatches: number;
  converged: boolean;
}

const RHO_BOUND = 0.3;

/** Negative penalised log-likelihood and its analytic gradient. Exported for gradient tests. */
export function dcObjective(matches: DcMatch[], teams: string[], opts: Required<Omit<DcOptions, "priors">> & Pick<DcOptions, "priors">) {
  const n = teams.length;
  const idx = new Map(teams.map((t, i) => [t, i]));
  const data = matches.map((m) => ({
    h: idx.get(m.home)!,
    a: idx.get(m.away)!,
    hg: m.homeGoals,
    ag: m.awayGoals,
    w: Math.exp(-opts.xi * m.ageDays),
  }));
  const priorAtt = teams.map((t) => opts.priors?.[t]?.att ?? 0);
  const priorDef = teams.map((t) => opts.priors?.[t]?.def ?? 0);

  // x = [mu, home, rho, att_0..att_{n-1}, def_0..def_{n-1}]
  return (x: Float64Array) => {
    const g = new Float64Array(x.length);
    const [mu, home, rho] = x;
    if (Math.abs(rho) > RHO_BOUND) return { f: Infinity, g };
    let ll = 0;
    for (const d of data) {
      const etaH = mu + home + x[3 + d.h] - x[3 + n + d.a];
      const etaA = mu + x[3 + d.a] - x[3 + n + d.h];
      const lh = Math.exp(etaH);
      const la = Math.exp(etaA);
      const tau = dcTau(d.hg, d.ag, lh, la, rho);
      if (tau <= 0) return { f: Infinity, g };
      ll += d.w * (d.hg * etaH - lh + d.ag * etaA - la + Math.log(tau));

      let dEtaH = d.hg - lh;
      let dEtaA = d.ag - la;
      let dRho = 0;
      if (d.hg === 0 && d.ag === 0) {
        dEtaH += (-lh * la * rho) / tau;
        dEtaA += (-lh * la * rho) / tau;
        dRho = (-lh * la) / tau;
      } else if (d.hg === 0 && d.ag === 1) {
        dEtaH += (lh * rho) / tau;
        dRho = lh / tau;
      } else if (d.hg === 1 && d.ag === 0) {
        dEtaA += (la * rho) / tau;
        dRho = la / tau;
      } else if (d.hg === 1 && d.ag === 1) {
        dRho = -1 / tau;
      }
      // Gradient of -ll
      g[0] -= d.w * (dEtaH + dEtaA);
      g[1] -= d.w * dEtaH;
      g[2] -= d.w * dRho;
      g[3 + d.h] -= d.w * dEtaH;
      g[3 + n + d.a] += d.w * dEtaH;
      g[3 + d.a] -= d.w * dEtaA;
      g[3 + n + d.h] += d.w * dEtaA;
    }
    let penalty = 0;
    for (let i = 0; i < n; i++) {
      const da = x[3 + i] - priorAtt[i];
      const dd = x[3 + n + i] - priorDef[i];
      penalty += opts.ridge * (da * da + dd * dd);
      g[3 + i] += 2 * opts.ridge * da;
      g[3 + n + i] += 2 * opts.ridge * dd;
    }
    return { f: -ll + penalty, g };
  };
}

export function fitDixonColes(matches: DcMatch[], options: DcOptions = {}): DcParams {
  const opts = { xi: options.xi ?? 0.0019, ridge: options.ridge ?? 1, priors: options.priors };
  const teams = [...new Set(matches.flatMap((m) => [m.home, m.away]))].sort();
  if (teams.length < 2) throw new Error("fitDixonColes: need at least two teams");
  const meanGoals = matches.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0) / (2 * matches.length) || 1.3;
  const x0 = new Float64Array(3 + 2 * teams.length);
  x0[0] = Math.log(meanGoals);
  x0[1] = 0.2;
  teams.forEach((t, i) => {
    x0[3 + i] = opts.priors?.[t]?.att ?? 0;
    x0[3 + teams.length + i] = opts.priors?.[t]?.def ?? 0;
  });
  const res = minimize(dcObjective(matches, teams, opts), x0, { maxIter: 1000, gradTol: 1e-7 });
  const n = teams.length;
  return {
    teams,
    attack: Object.fromEntries(teams.map((t, i) => [t, res.x[3 + i]])),
    defence: Object.fromEntries(teams.map((t, i) => [t, res.x[3 + n + i]])),
    mu: res.x[0],
    homeAdv: res.x[1],
    rho: res.x[2],
    xi: opts.xi,
    logLik: -res.f,
    nMatches: matches.length,
    converged: res.converged,
  };
}

export function dcLambdas(p: DcParams, home: string, away: string): { lambdaHome: number; lambdaAway: number } {
  const att = (t: string) => p.attack[t] ?? 0;
  const def = (t: string) => p.defence[t] ?? 0;
  return {
    lambdaHome: Math.exp(p.mu + p.homeAdv + att(home) - def(away)),
    lambdaAway: Math.exp(p.mu + att(away) - def(home)),
  };
}

export interface DcPrediction extends MarketProbs {
  lambdaHome: number;
  lambdaAway: number;
  matrix: number[][];
}

export function dcPredict(p: DcParams, home: string, away: string): DcPrediction {
  const { lambdaHome, lambdaAway } = dcLambdas(p, home, away);
  const matrix = scoreMatrix(lambdaHome, lambdaAway, p.rho);
  return { lambdaHome, lambdaAway, matrix, ...marketsFromMatrix(matrix) };
}
