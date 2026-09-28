export const pct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(digits)} %`);
export const signedPct = (x: number | null | undefined, digits = 1) =>
  x === null || x === undefined || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)} %`;
export const odds = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x.toFixed(2));
export const eur = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const signedEur = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${eur(x)}`);

const paris = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...opts });
export const kickoff = (iso: string) => paris({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const shortDate = (iso: string) => paris({ day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
export const dayKey = (iso: string) => paris({ weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

export const LEAGUE_SHORT: Record<string, string> = { L1: "L1", EPL: "PL", LIGA: "Liga" };
export const MARKET_LABEL: Record<string, string> = { h2h: "1N2", totals_2_5: "±2.5 buts", btts: "Les 2 marquent" };
export const OUTCOME_LABEL: Record<string, string> = { home: "1", draw: "N", away: "2", over: "+2.5", under: "−2.5", yes: "Oui", no: "Non" };
