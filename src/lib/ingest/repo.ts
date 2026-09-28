import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueId } from "@/lib/leagues";
import type { OddsQuote } from "@/lib/providers/types";
import type { ApiCallMeta, QuotaState } from "@/lib/providers/usage";
import { resolveTeamName, type TeamSource } from "@/lib/teams/resolve";

/** Thin data-access layer used by the backfill script and cron jobs. */

const CHUNK = 1000;

async function inChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Resolves provider team names to team ids, creating teams/aliases as needed. Caches per instance. */
export class TeamResolver {
  private byName = new Map<string, number>();
  private aliases = new Map<string, number>(); // `${source}|${alias}` → id
  private leagueTeams = new Map<LeagueId, string[]>();

  constructor(private db: SupabaseClient) {}

  async load() {
    const teams = check(await this.db.from("teams").select("id, name"), "load teams") as { id: number; name: string }[];
    for (const t of teams) this.byName.set(t.name, t.id);
    const aliases = check(await this.db.from("team_aliases").select("source, alias, team_id"), "load aliases") as {
      source: string;
      alias: string;
      team_id: number;
    }[];
    for (const a of aliases) this.aliases.set(`${a.source}|${a.alias}`, a.team_id);
    return this;
  }

  private async candidates(league: LeagueId): Promise<string[]> {
    const cached = this.leagueTeams.get(league);
    if (cached) return cached;
    const since = new Date(Date.now() - 400 * 86400 * 1000).toISOString();
    const rows = check(
      await this.db.from("matches").select("home_team_id").eq("league_id", league).gte("kickoff_at", since),
      "league teams",
    ) as { home_team_id: number }[];
    const ids = new Set(rows.map((r) => r.home_team_id));
    const names = [...this.byName.entries()].filter(([, id]) => ids.has(id)).map(([name]) => name);
    this.leagueTeams.set(league, names);
    return names;
  }

  private async ensureTeam(name: string): Promise<number> {
    const existing = this.byName.get(name);
    if (existing) return existing;
    const row = check(
      await this.db.from("teams").upsert({ name }, { onConflict: "name" }).select("id").single(),
      `create team ${name}`,
    ) as { id: number };
    this.byName.set(name, row.id);
    return row.id;
  }

  /** Returns null (and records the name) when the team can't be resolved confidently. */
  async resolve(source: TeamSource, league: LeagueId, raw: string): Promise<number | null> {
    const key = `${source}|${raw}`;
    const cached = this.aliases.get(key);
    if (cached) return cached;

    // football-data.co.uk names are the canonical names.
    const canonical = source === "fdcouk" ? raw : resolveTeamName(raw, await this.candidates(league));
    if (!canonical) {
      await this.db
        .from("unresolved_team_names")
        .upsert({ source, league_id: league, name: raw, last_seen: new Date().toISOString() }, { onConflict: "source,league_id,name" });
      return null;
    }
    const id = await this.ensureTeam(canonical);
    await this.db.from("team_aliases").upsert({ source, alias: raw, team_id: id }, { onConflict: "source,alias", ignoreDuplicates: true });
    this.aliases.set(key, id);
    return id;
  }
}

export interface MatchRow {
  league_id: LeagueId;
  season: string;
  kickoff_at: string;
  home_team_id: number;
  away_team_id: number;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_xg?: number | null;
  away_xg?: number | null;
  fd_org_id?: number;
  odds_api_event_id?: string;
}

export type MatchKey = Pick<MatchRow, "league_id" | "season" | "home_team_id" | "away_team_id">;
export const matchKey = (m: MatchKey) => `${m.league_id}|${m.season}|${m.home_team_id}|${m.away_team_id}`;

/** Idempotent upsert on the natural key; returns natural-key → match id. */
export async function upsertMatches(db: SupabaseClient, rows: MatchRow[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  await inChunks(stamped, async (chunk) => {
    const data = check(
      await db
        .from("matches")
        .upsert(chunk, { onConflict: "league_id,season,home_team_id,away_team_id" })
        .select("id, league_id, season, home_team_id, away_team_id"),
      "upsert matches",
    ) as (MatchKey & { id: number })[];
    for (const m of data) ids.set(matchKey(m), m.id);
  });
  return ids;
}

/** Inserts odds, ignoring rows already stored (same match/time/book/market/outcome). */
export async function insertOdds(db: SupabaseClient, source: "odds_api" | "fdcouk", rows: { matchId: number; quote: OddsQuote }[]) {
  const records = rows.map(({ matchId, quote }) => ({
    match_id: matchId,
    captured_at: quote.capturedAt.toISOString(),
    source,
    bookmaker: quote.bookmaker,
    market: quote.market,
    outcome: quote.outcome,
    price: quote.price,
    is_closing: quote.isClosing,
  }));
  await inChunks(records, async (chunk) => {
    check(
      await db
        .from("odds_snapshots")
        .upsert(chunk, { onConflict: "match_id,captured_at,bookmaker,market,outcome", ignoreDuplicates: true }),
      "insert odds",
    );
  });
  return records.length;
}

export async function logApiCall(db: SupabaseClient, meta: ApiCallMeta, job: string) {
  await db.from("api_usage").insert({
    provider: meta.provider,
    endpoint: meta.endpoint,
    http_status: meta.httpStatus,
    credits_used: meta.creditsUsed,
    credits_remaining: meta.creditsRemaining,
    job,
  });
}

export async function oddsQuotaState(db: SupabaseClient, monthlyCredits: number, now = new Date()): Promise<QuotaState> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const rows = check(
    await db
      .from("api_usage")
      .select("credits_used, credits_remaining, called_at")
      .eq("provider", "odds_api")
      .gte("called_at", monthStart)
      .order("called_at", { ascending: false }),
    "quota state",
  ) as { credits_used: number; credits_remaining: number | null }[];
  return {
    monthlyCredits,
    lastRemaining: rows.find((r) => r.credits_remaining !== null)?.credits_remaining ?? null,
    usedThisMonth: rows.reduce((s, r) => s + r.credits_used, 0),
  };
}
