import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAGUES, type LeagueConfig } from "@/lib/leagues";
import { fetchFdOrgMatches } from "@/lib/providers/fd-org";
import { eventToQuotes, fetchOddsApiLeague, ODDS_API_MARKETS } from "@/lib/providers/odds-api";
import { canSpend, type ApiCallMeta } from "@/lib/providers/usage";
import { insertOdds, logApiCall, oddsQuotaState, TeamResolver, upsertMatches, type MatchRow } from "./repo";

const DAY = 86400 * 1000;
const MIN = 60 * 1000;

export interface JobReport {
  job: string;
  details: Record<string, unknown>;
}

async function logged<T extends { meta: ApiCallMeta }>(db: SupabaseClient, job: string, call: () => Promise<T>): Promise<T> {
  try {
    const result = await call();
    await logApiCall(db, result.meta, job);
    return result;
  } catch (err) {
    const meta = (err as { meta?: ApiCallMeta }).meta;
    if (meta) await logApiCall(db, meta, job);
    throw err;
  }
}

/** Fixtures D-3…D+7 for every league: creates new fixtures, fills finished results. */
export async function syncFixtures(db: SupabaseClient, token: string, now = new Date()): Promise<JobReport> {
  const resolver = await new TeamResolver(db).load();
  const details: Record<string, unknown> = {};
  for (const league of LEAGUES) {
    const { fixtures } = await logged(db, "sync-fixtures", () =>
      fetchFdOrgMatches(league, new Date(now.getTime() - 3 * DAY), new Date(now.getTime() + 7 * DAY), token),
    );
    const rows: MatchRow[] = [];
    let unresolved = 0;
    for (const f of fixtures) {
      const home = await resolver.resolve("fd_org", league.id, f.homeName);
      const away = await resolver.resolve("fd_org", league.id, f.awayName);
      if (!home || !away) {
        unresolved++;
        continue;
      }
      rows.push({
        league_id: league.id,
        season: f.season,
        kickoff_at: f.kickoffAt.toISOString(),
        home_team_id: home,
        away_team_id: away,
        status: f.status,
        home_goals: f.homeGoals,
        away_goals: f.awayGoals,
        fd_org_id: f.fdOrgId,
      });
    }
    await upsertMatches(db, rows);
    details[league.id] = { fetched: fixtures.length, upserted: rows.length, unresolved };
  }
  return { job: "sync-fixtures", details };
}

interface UpcomingMatch {
  id: number;
  kickoff_at: string;
  home_team_id: number;
  away_team_id: number;
}

async function upcoming(db: SupabaseClient, league: LeagueConfig, from: Date, to: Date): Promise<UpcomingMatch[]> {
  const { data, error } = await db
    .from("matches")
    .select("id, kickoff_at, home_team_id, away_team_id")
    .eq("league_id", league.id)
    .eq("status", "scheduled")
    .gte("kickoff_at", from.toISOString())
    .lte("kickoff_at", to.toISOString());
  if (error) throw new Error(`upcoming matches: ${error.message}`);
  return data as UpcomingMatch[];
}

async function matchesWithClosing(db: SupabaseClient, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await db
    .from("odds_snapshots")
    .select("match_id")
    .in("match_id", ids)
    .eq("source", "odds_api")
    .eq("is_closing", true);
  if (error) throw new Error(`closing lookup: ${error.message}`);
  return new Set((data as { match_id: number }[]).map((r) => r.match_id));
}

export type OddsMode = "daily" | "closing";

/**
 * daily   — one snapshot per league that has a match in the next 7 days.
 * closing — every 10 min; fetch a league only if one of its matches kicks off in
 *           15–30 min and has no closing snapshot yet. Those matches get is_closing=true.
 */
export async function snapshotOdds(
  db: SupabaseClient,
  apiKey: string,
  monthlyCredits: number,
  mode: OddsMode,
  now = new Date(),
): Promise<JobReport> {
  const resolver = await new TeamResolver(db).load();
  const details: Record<string, unknown> = {};
  const cost = ODDS_API_MARKETS.length;

  for (const league of LEAGUES) {
    const horizon = await upcoming(db, league, now, new Date(now.getTime() + 8 * DAY));
    let closingIds = new Set<number>();
    if (mode === "closing") {
      const inWindow = horizon.filter((m) => {
        const t = new Date(m.kickoff_at).getTime() - now.getTime();
        return t >= 15 * MIN && t <= 30 * MIN;
      });
      const done = await matchesWithClosing(db, inWindow.map((m) => m.id));
      closingIds = new Set(inWindow.filter((m) => !done.has(m.id)).map((m) => m.id));
      if (closingIds.size === 0) continue;
    } else if (!horizon.some((m) => new Date(m.kickoff_at).getTime() <= now.getTime() + 7 * DAY)) {
      details[league.id] = "skipped: no match in 7 days";
      continue;
    }

    if (!canSpend(await oddsQuotaState(db, monthlyCredits, now), cost)) {
      details[league.id] = "skipped: quota guard (95%)";
      continue;
    }

    const { events } = await logged(db, `odds-${mode}`, () => fetchOddsApiLeague(league, apiKey));
    const rows: { matchId: number; quote: ReturnType<typeof eventToQuotes>[number] }[] = [];
    let unmatched = 0;
    for (const event of events) {
      const home = await resolver.resolve("odds_api", league.id, event.home_team);
      const away = await resolver.resolve("odds_api", league.id, event.away_team);
      const kickoff = new Date(event.commence_time).getTime();
      const match = horizon.find(
        (m) => m.home_team_id === home && m.away_team_id === away && Math.abs(new Date(m.kickoff_at).getTime() - kickoff) < 3 * DAY,
      );
      if (!match) {
        unmatched++;
        continue;
      }
      await db.from("matches").update({ odds_api_event_id: event.id }).eq("id", match.id).is("odds_api_event_id", null);
      for (const quote of eventToQuotes(event, now, closingIds.has(match.id))) rows.push({ matchId: match.id, quote });
    }
    const inserted = await insertOdds(db, "odds_api", rows);
    details[league.id] = { events: events.length, quotes: inserted, unmatched, closing: closingIds.size };
  }
  return { job: `odds-${mode}`, details };
}
