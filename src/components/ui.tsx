import type { ReactNode } from "react";

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl md:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </header>
  );
}

export function Card({ children, className = "", highlight = false }: { children: ReactNode; className?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border bg-surface ${highlight ? "border-gold/60" : "border-line"} ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint, accent = false, big = false }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`font-mono tabular-nums ${big ? "text-3xl" : "text-lg"} ${accent ? "text-gold" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Banner({ tone, title, children }: { tone: "danger" | "warn" | "info"; title: string; children?: ReactNode }) {
  const styles = { danger: "border-loss/60 bg-loss/10", warn: "border-gold/60 bg-gold/10", info: "border-line bg-surface" }[tone];
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

/** Colour for a signed number. */
export const tone = (x: number | null | undefined) => (x === null || x === undefined || x === 0 ? "" : x > 0 ? "text-win" : "text-loss");
