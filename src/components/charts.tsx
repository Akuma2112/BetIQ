/** Dependency-free SVG charts (server-renderable). */

const W = 600;
const H = 260;
const PAD = { l: 70, r: 16, t: 14, b: 36 };

function scale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
}

function ticks(min: number, max: number, n = 4): number[] {
  if (min === max) return [min];
  const step = (max - min) / n;
  return Array.from({ length: n + 1 }, (_, i) => min + i * step);
}

export interface Series {
  name: string;
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
}

export function LineChart({
  series,
  yFormat = (v) => v.toFixed(2),
  xFormat,
  zeroLine = false,
  height = H,
  ariaLabel,
}: {
  series: Series[];
  yFormat?: (v: number) => string;
  xFormat?: (v: number) => string;
  zeroLine?: boolean;
  height?: number;
  ariaLabel: string;
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="py-8 text-center text-sm text-muted">Pas assez de données.</p>;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  let [yMin, yMax] = [Math.min(...ys, zeroLine ? 0 : Infinity), Math.max(...ys, zeroLine ? 0 : -Infinity)];
  const padY = (yMax - yMin) * 0.08 || 0.1;
  yMin -= padY;
  yMax += padY;
  const x = scale([Math.min(...xs), Math.max(...xs)], [PAD.l, W - PAD.r]);
  const y = scale([yMin, yMax], [height - PAD.b, PAD.t]);
  const xt = ticks(Math.min(...xs), Math.max(...xs), 3);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        {ticks(yMin, yMax).map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#262626" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted font-mono text-[17px]">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {zeroLine && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="#8a8a8a" strokeDasharray="3 3" />}
        {xFormat &&
          xt.map((t, i) => (
            <text key={t} x={x(t)} y={height - 10} textAnchor={i === 0 ? "start" : i === xt.length - 1 ? "end" : "middle"} className="fill-muted font-mono text-[17px]">
              {xFormat(t)}
            </text>
          ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="1.8"
            strokeDasharray={s.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
            points={s.points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ")}
          />
        ))}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

export function CalibrationChart({ bins }: { bins: { meanPred: number; observed: number; n: number }[] }) {
  const size = 260;
  const p = 32;
  const s = scale([0, 1], [p, size - 8]);
  const sy = scale([0, 1], [size - p + 8, 8]);
  const maxN = Math.max(...bins.map((b) => b.n));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-xs" role="img" aria-label="Courbe de calibration">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={s(0)} x2={s(1)} y1={sy(t)} y2={sy(t)} stroke="#262626" />
          <text x={p - 4} y={sy(t) + 3} textAnchor="end" className="fill-muted font-mono text-[9px]">
            {Math.round(t * 100)}
          </text>
          <text x={s(t)} y={size - 6} textAnchor="middle" className="fill-muted font-mono text-[9px]">
            {Math.round(t * 100)}
          </text>
        </g>
      ))}
      <line x1={s(0)} y1={sy(0)} x2={s(1)} y2={sy(1)} stroke="#8a8a8a" strokeDasharray="4 3" />
      <polyline fill="none" stroke="#c9a84c" strokeWidth="1.8" points={bins.map((b) => `${s(b.meanPred)},${sy(b.observed)}`).join(" ")} />
      {bins.map((b) => (
        <circle key={b.meanPred} cx={s(b.meanPred)} cy={sy(b.observed)} r={2 + 4 * Math.sqrt(b.n / maxN)} fill="#c9a84c" fillOpacity="0.8">
          <title>{`prédit ${(b.meanPred * 100).toFixed(1)} % · observé ${(b.observed * 100).toFixed(1)} % · n=${b.n}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Score-probability heatmap (rows = home goals, cols = away goals). */
export function Heatmap({ matrix, home, away }: { matrix: number[][]; home: string; away: string }) {
  const n = Math.min(matrix.length, 6);
  const max = Math.max(...matrix.slice(0, n).flatMap((r) => r.slice(0, n)));
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-0.5 font-mono text-[11px]">
        <caption className="mb-2 text-xs text-muted">
          Lignes : buts {home} · colonnes : buts {away}
        </caption>
        <thead>
          <tr>
            <th />
            {Array.from({ length: n }, (_, j) => (
              <th key={j} className="px-1 font-normal text-muted">
                {j}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.slice(0, n).map((row, i) => (
            <tr key={i}>
              <th className="pr-1 font-normal text-muted">{i}</th>
              {row.slice(0, n).map((p, j) => (
                <td
                  key={j}
                  className="h-9 w-11 rounded-sm text-center"
                  style={{ background: `color-mix(in srgb, var(--color-gold) ${Math.round((p / max) * 85)}%, var(--color-surface))`, color: p / max > 0.55 ? "var(--color-bg)" : undefined }}
                  title={`${i}-${j} : ${(p * 100).toFixed(2)} %`}
                >
                  {(p * 100).toFixed(1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
