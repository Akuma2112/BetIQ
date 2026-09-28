import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAGUES, seasonForDate } from "@/lib/leagues";
import { DEFAULT_MODEL, fitLeague, MODEL_VERSION, predictMatch, type HistMatch, type ModelConfig } from "@/lib/model/predict";
import type { JobReport } from "./jobs";

const DAY = 86400 * 1000;
const PAGE = 1000;

interface Row {
  id: number;
  season: string;
  kickoff_at: string;
  home_team_id: number;
  away_team_id: number;
  home_goals: number | null;
  away_goals: number | null;
}

async function fetchAll(db: SupabaseClient, leagueId: string, status: string, from: Date, to: Date): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("matches")
      .select("id, season, kickoff_at, home_team_id, away_team_id, home_goals, away_goals")
      .eq("league_id", leagueId)
      .eq("status", status)
      .gte("kickoff_at", from.toISOString())
      .lt("kickoff_at", to.toISOString())
      .order("kickoff_at")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`refit load: ${error.message}`);
    out.push(...(data as Row[]));
    if (data.length < PAGE) return out;
  }
}

/** Refit Dixon-Coles + Elo per league as of now and store predictions for the next 8 days. */
export async function refit(db: SupabaseClient, config: ModelConfig = DEFAULT_MODEL, now = new Date()): Promise<JobReport> {
  const { data: teams, error } = await db.from("teams").select("id, name");
  if (error) throw new Error(`refit teams: ${error.message}`);
  const name = new Map((teams as { id: number; name: string }[]).map((t) => [t.id, t.name]));
  const details: Record<string, unknown> = {};

  for (const league of LEAGUES) {
    const past = await fetchAll(db, league.id, "finished", new Date(now.getTime() - 4 * 365 * DAY), now);
    const upcoming = await fetchAll(db, league.id, "scheduled", now, new Date(now.getTime() + 8 * DAY));
    if (past.length < 50) {
      details[league.id] = `skipped: ${past.length} finished matches (run the backfill)`;
      continue;
    }
    const history: HistMatch[] = past.map((m) => ({
      home: name.get(m.home_team_id)!,
      away: name.get(m.away_team_id)!,
      homeGoals: m.home_goals!,
      awayGoals: m.away_goals!,
      kickoffAt: new Date(m.kickoff_at),
      season: m.season,
    }));
    const model = fitLeague(history, now, seasonForDate(now), config);

    await db.from("model_ratings").upsert(
      [
        { league_id: league.id, model: "dixon_coles", as_of: now.toISOString(), params: model.dc, fit_stats: { logLik: model.dc.logLik, n: model.dc.nMatches, converged: model.dc.converged } },
        { league_id: league.id, model: "elo", as_of: now.toISOString(), params: { ratings: model.elo.ratings, config: config.elo, drawModel: model.drawModel } },
      ],
      { onConflict: "league_id,model,as_of" },
    );

    const rows = upcoming.map((m) => {
      const p = predictMatch(model, name.get(m.home_team_id)!, name.get(m.away_team_id)!);
      return {
        match_id: m.id,
        model_version: MODEL_VERSION,
        created_at: now.toISOString(),
        lambda_home: p.dc.lambdaHome,
        lambda_away: p.dc.lambdaAway,
        p_home: p.oneXTwo.home,
        p_draw: p.oneXTwo.draw,
        p_away: p.oneXTwo.away,
        p_over_2_5: p.over25,
        p_btts: p.btts,
        score_matrix: p.dc.matrix.slice(0, 7).map((r) => r.slice(0, 7).map((v) => Math.round(v * 1e5) / 1e5)),
        components: { dc: { home: p.dc.home, draw: p.dc.draw, away: p.dc.away }, elo: p.elo, dcWeight: config.dcWeight, xi: config.xi },
      };
    });
    if (rows.length) {
      const { error: e } = await db.from("predictions").upsert(rows, { onConflict: "match_id,model_version" });
      if (e) throw new Error(`refit predictions: ${e.message}`);
    }
    details[league.id] = { trainedOn: past.length, predicted: rows.length, converged: model.dc.converged };
  }
  return { job: "refit", details };
}
