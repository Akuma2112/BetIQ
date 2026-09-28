export type LeagueId = "L1" | "EPL" | "LIGA";

export interface LeagueConfig {
  id: LeagueId;
  name: string;
  fdOrgCode: string;
  oddsApiKey: string;
  fdcoukCode: string;
}

// Mirrors the `leagues` seed in supabase/migrations/20260928000000_init.sql.
export const LEAGUES: readonly LeagueConfig[] = [
  { id: "L1", name: "Ligue 1", fdOrgCode: "FL1", oddsApiKey: "soccer_france_ligue_one", fdcoukCode: "F1" },
  { id: "EPL", name: "Premier League", fdOrgCode: "PL", oddsApiKey: "soccer_epl", fdcoukCode: "E0" },
  { id: "LIGA", name: "La Liga", fdOrgCode: "PD", oddsApiKey: "soccer_spain_la_liga", fdcoukCode: "SP1" },
];

export function leagueById(id: LeagueId): LeagueConfig {
  const league = LEAGUES.find((l) => l.id === id);
  if (!league) throw new Error(`Unknown league ${id}`);
  return league;
}

/** '2025-26' for a season starting in 2025. */
export function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** European seasons start in July/August: a date before July belongs to the previous season. */
export function seasonForDate(date: Date): string {
  const y = date.getUTCFullYear();
  return seasonLabel(date.getUTCMonth() >= 6 ? y : y - 1);
}

/** football-data.co.uk path segment: 2025 → '2526'. */
export function fdcoukSeasonCode(startYear: number): string {
  return `${String(startYear % 100).padStart(2, "0")}${String((startYear + 1) % 100).padStart(2, "0")}`;
}
