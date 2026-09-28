import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateGuards, type BetStatus, type GuardState } from "@/lib/guardrails";
import type { LatestOdd, PickSettings, PredictionRow } from "@/lib/picks";
import type { BetRow } from "@/lib/stats";

/** Server-side reads (RLS-scoped client from requireOwner()). */

export interface Settings extends PickSettings {
  bankroll: number;
  monthlyBudget: number;
  lossStreakWarning: number;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export async function getSettings(db: SupabaseClient): Promise<Settings> {
  const s = check(await db.from("bankroll_settings").select("*").eq("id", 1).single(), "settings") as Record<string, number>;
  return {
    bankroll: Number(s.bankroll),
    kellyFraction: Number(s.kelly_fraction),
    maxStakePct: Number(s.max_stake_pct),
    monthlyBudget: Number(s.monthly_budget),
    valueThreshold: Number(s.value_threshold),
    modelWeight: Number(s.model_weight),
    lossStreakWarning: Number(s.loss_streak_warning),
  };
}

export const monthStartUtc = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function getGuards(db: SupabaseClient, settings: Settings): Promise<GuardState> {
  const monthBets = check(
    await db.from("bets").select("stake").gte("placed_at", monthStartUtc().toISOString()),
    "month bets",
  ) as { stake: number }[];
  const settled = check(
    await db.from("bets").select("status, pnl, placed_at").neq("status", "pending").order("placed_at", { ascending: false }).limit(1000),
    "settled bets",
  ) as { status: BetStatus; pnl: number | null }[];
  return evaluateGuards({
    bankroll: settings.bankroll,
    monthlyBudget: settings.monthlyBudget,
    maxStakePct: settings.maxStakePct,
    lossStreakWarning: settings.lossStreakWarning,
    stakedThisMonth: monthBets.reduce((s, b) => s + Number(b.stake), 0),
    realizedPnl: settled.reduce((s, b) => s + Number(b.pnl ?? 0), 0),
    recentResults: settled.map((b) => b.status),
  });
}

export interface MatchSummary {
  id: number;
  league_id: string;
  kickoff_at: string;
  status: string;
  home: string;
  away: string;
  home_goals: number | null;
  away_goals: number | null;
}

const MATCH_SELECT = "id, league_id, kickoff_at, status, home_goals, away_goals, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)";

type RawMatch = Omit<MatchSummary, "home" | "away"> & { home: { name: string }; away: { name: string } };
const flatten = (m: RawMatch): MatchSummary => ({ ...m, home: m.home.name, away: m.away.name });

export async function getUpcoming(db: SupabaseClient, days = 7): Promise<MatchSummary[]> {
  const now = new Date();
  const rows = check(
    await db
      .from("matches")
      .select(MATCH_SELECT)
      .eq("status", "scheduled")
      .gte("kickoff_at", new Date(now.getTime() - 2 * 3600 * 1000).toISOString())
      .lte("kickoff_at", new Date(now.getTime() + days * 86400 * 1000).toISOString())
      .order("kickoff_at"),
    "upcoming",
  ) as unknown as RawMatch[];
  return rows.map(flatten);
}

export async function getMatch(db: SupabaseClient, id: number): Promise<MatchSummary | null> {
  const row = check(await db.from("matches").select(MATCH_SELECT).eq("id", id).maybeSingle(), "match") as unknown as RawMatch | null;
  return row ? flatten(row) : null;
}

export interface StoredPrediction extends PredictionRow {
  match_id: number;
  lambda_home: number;
  lambda_away: number;
  score_matrix: number[][];
  components: { dc: Record<string, number>; elo: Record<string, number> };
  created_at: string;
}

export async function getPredictions(db: SupabaseClient, matchIds: number[]): Promise<Map<number, StoredPrediction>> {
  if (!matchIds.length) return new Map();
  const rows = check(await db.from("latest_predictions").select("*").in("match_id", matchIds), "predictions") as StoredPrediction[];
  return new Map(rows.map((r) => [r.match_id, { ...r, p_home: Number(r.p_home), p_draw: Number(r.p_draw), p_away: Number(r.p_away), p_over_2_5: Number(r.p_over_2_5), p_btts: Number(r.p_btts) }]));
}

export async function getLatestOdds(db: SupabaseClient, matchIds: number[]): Promise<Map<number, LatestOdd[]>> {
  const out = new Map<number, LatestOdd[]>();
  if (!matchIds.length) return out;
  const rows = check(
    await db.from("latest_odds").select("match_id, bookmaker, market, outcome, price, captured_at").in("match_id", matchIds).limit(10000),
    "latest odds",
  ) as { match_id: number; bookmaker: string; market: LatestOdd["market"]; outcome: LatestOdd["outcome"]; price: number; captured_at: string }[];
  for (const r of rows) {
    const list = out.get(r.match_id) ?? [];
    list.push({ bookmaker: r.bookmaker, market: r.market, outcome: r.outcome, price: Number(r.price), capturedAt: r.captured_at });
    out.set(r.match_id, list);
  }
  return out;
}

export async function getOddsHistory(db: SupabaseClient, matchId: number) {
  return check(
    await db
      .from("odds_snapshots")
      .select("bookmaker, market, outcome, price, captured_at, is_closing")
      .eq("match_id", matchId)
      .eq("source", "odds_api")
      .order("captured_at"),
    "odds history",
  ) as { bookmaker: string; market: string; outcome: string; price: number; captured_at: string; is_closing: boolean }[];
}

export async function getRecentForm(db: SupabaseClient, teamName: string, before: string, n = 5): Promise<string[]> {
  const team = check(await db.from("teams").select("id").eq("name", teamName).maybeSingle(), "team") as { id: number } | null;
  if (!team) return [];
  const rows = check(
    await db
      .from("matches")
      .select("home_team_id, home_goals, away_goals")
      .eq("status", "finished")
      .lt("kickoff_at", before)
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .order("kickoff_at", { ascending: false })
      .limit(n),
    "form",
  ) as { home_team_id: number; home_goals: number; away_goals: number }[];
  return rows.map((m) => {
    const [gf, ga] = m.home_team_id === team.id ? [m.home_goals, m.away_goals] : [m.away_goals, m.home_goals];
    return gf > ga ? "V" : gf === ga ? "N" : "D";
  });
}

export interface BetView extends BetRow {
  outcome: string;
  bookmaker: string;
  model_prob: number;
  value_at_bet: number;
  closing_odds: number | null;
  match_id: number;
  home: string;
  away: string;
  kickoff_at: string;
}

export async function getBets(db: SupabaseClient): Promise<BetView[]> {
  const rows = check(
    await db
      .from("bets")
      .select(
        "id, placed_at, market, outcome, bookmaker, odds_taken, stake, status, pnl, clv, closing_odds, model_prob, value_at_bet, match_id, match:matches(league_id, kickoff_at, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name))",
      )
      .order("placed_at", { ascending: false })
      .limit(1000),
    "bets",
  ) as unknown as (Omit<BetView, "home" | "away" | "league_id" | "kickoff_at"> & {
    match: { league_id: string; kickoff_at: string; home: { name: string }; away: { name: string } };
  })[];
  return rows.map(({ match, ...b }) => ({
    ...b,
    odds_taken: Number(b.odds_taken),
    stake: Number(b.stake),
    pnl: b.pnl === null ? null : Number(b.pnl),
    clv: b.clv === null ? null : Number(b.clv),
    closing_odds: b.closing_odds === null ? null : Number(b.closing_odds),
    league_id: match.league_id,
    kickoff_at: match.kickoff_at,
    home: match.home.name,
    away: match.away.name,
  }));
}

export async function getOddsCredits(db: SupabaseClient): Promise<{ used: number; remaining: number | null }> {
  const rows = check(
    await db
      .from("api_usage")
      .select("credits_used, credits_remaining")
      .eq("provider", "odds_api")
      .gte("called_at", monthStartUtc().toISOString())
      .order("called_at", { ascending: false }),
    "api usage",
  ) as { credits_used: number; credits_remaining: number | null }[];
  return { used: rows.reduce((s, r) => s + r.credits_used, 0), remaining: rows.find((r) => r.credits_remaining !== null)?.credits_remaining ?? null };
}
