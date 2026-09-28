/** Minimal L-BFGS with backtracking (Armijo) line search. Pure. */

export type Objective = (x: Float64Array) => { f: number; g: Float64Array };

export interface MinimizeResult {
  x: Float64Array;
  f: number;
  iterations: number;
  converged: boolean;
}

const dot = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function minimize(
  objective: Objective,
  x0: ArrayLike<number>,
  { maxIter = 500, gradTol = 1e-6, memory = 10 }: { maxIter?: number; gradTol?: number; memory?: number } = {},
): MinimizeResult {
  const n = x0.length;
  let x = Float64Array.from(x0);
  let { f, g } = objective(x);
  if (!Number.isFinite(f)) throw new Error("minimize: objective is not finite at x0");
  const S: Float64Array[] = [];
  const Y: Float64Array[] = [];
  let iterations = 0;

  for (; iterations < maxIter; iterations++) {
    const gNorm = Math.sqrt(dot(g, g));
    if (gNorm < gradTol * Math.max(1, Math.abs(f))) return { x, f, iterations, converged: true };

    // Two-loop recursion → search direction d = -H g
    const q = Float64Array.from(g);
    const alpha: number[] = [];
    for (let k = S.length - 1; k >= 0; k--) {
      const a = dot(S[k], q) / dot(Y[k], S[k]);
      alpha[k] = a;
      for (let i = 0; i < n; i++) q[i] -= a * Y[k][i];
    }
    const gamma = S.length ? dot(S[S.length - 1], Y[Y.length - 1]) / dot(Y[Y.length - 1], Y[Y.length - 1]) : 1 / gNorm;
    for (let i = 0; i < n; i++) q[i] *= gamma;
    for (let k = 0; k < S.length; k++) {
      const b = dot(Y[k], q) / dot(Y[k], S[k]);
      for (let i = 0; i < n; i++) q[i] += S[k][i] * (alpha[k] - b);
    }
    let d = q.map((v) => -v);
    let slope = dot(g, d);
    if (slope >= 0) {
      // Not a descent direction: reset memory, use steepest descent.
      S.length = 0;
      Y.length = 0;
      d = g.map((v) => -v / gNorm);
      slope = dot(g, d);
    }

    let step = 1;
    let next: { f: number; g: Float64Array } | null = null;
    let xNext = x;
    for (let ls = 0; ls < 40; ls++) {
      xNext = x.map((v, i) => v + step * d[i]);
      const trial = objective(xNext);
      if (Number.isFinite(trial.f) && trial.f <= f + 1e-4 * step * slope) {
        next = trial;
        break;
      }
      step *= 0.5;
    }
    if (!next) return { x, f, iterations, converged: false };

    const s = xNext.map((v, i) => v - x[i]);
    const y = next.g.map((v, i) => v - g[i]);
    if (dot(s, y) > 1e-12) {
      S.push(s);
      Y.push(y);
      if (S.length > memory) {
        S.shift();
        Y.shift();
      }
    }
    const improvement = f - next.f;
    x = xNext;
    f = next.f;
    g = next.g;
    if (improvement >= 0 && improvement < 1e-12 * Math.max(1, Math.abs(f))) return { x, f, iterations: iterations + 1, converged: true };
  }
  return { x, f, iterations, converged: false };
}

/** Central finite-difference gradient — for small problems and for testing analytic gradients. */
export function numericGradient(fn: (x: Float64Array) => number, x: Float64Array, h = 1e-6): Float64Array {
  const g = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const xp = Float64Array.from(x);
    const xm = Float64Array.from(x);
    xp[i] += h;
    xm[i] -= h;
    g[i] = (fn(xp) - fn(xm)) / (2 * h);
  }
  return g;
}
