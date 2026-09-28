import { blend, type ThreeWay } from "./betting";
import { dcPredict, fitDixonColes, type DcParams, type DcPrediction } from "./dixon-coles";
import { DEFAULT_ELO, eloDiff, eloProbs, eloUpdate, emptyElo, fitDrawModel, type DrawModel, type EloConfig, type EloState, type Result } from "./elo";

/** Fit everything for one league as of a date, then predict fixtures. Pure. */

export interface HistMatch {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  kickoffAt: Date;
  season: string;
}

export interface ModelConfig {
  /** Dixon-Coles time decay per day. */
  xi: number;
  ridge: number;
  /** Weight of Dixon-Coles in the 1X2 blend (Elo gets 1 − w). */
  dcWeight: number;
  /** Ridge centre for teams absent from the league last season (promoted). */
  promotedPrior: { att: number; def: number };
  /** Ignore matches older than this for Dixon-Coles. */
  historyDays: number;
  elo: EloConfig;
}

// ξ chosen on the 2023-24 validation season (grid 0.001 / 0.0019 / 0.003); dcWeight likewise.
export const DEFAULT_MODEL: ModelConfig = {
  xi: 0.001,
  ridge: 1,
  dcWeight: 0.7,
  promotedPrior: { att: -0.2, def: -0.2 },
  historyDays: 1100,
  elo: DEFAULT_ELO,
};

export const MODEL_VERSION = "dc+elo@v1";

export interface LeagueModel {
  asOf: Date;
  dc: DcParams;
  elo: EloState;
  drawModel: DrawModel;
  config: ModelConfig;
}

const DAY = 86400 * 1000;

const resultOf = (m: { homeGoals: number; awayGoals: number }): Result =>
  m.homeGoals > m.awayGoals ? "home" : m.homeGoals === m.awayGoals ? "draw" : "away";

/** Uses only matches with kickoff strictly before `asOf` — no look-ahead. */
export function fitLeague(history: HistMatch[], asOf: Date, currentSeason: string, config: ModelConfig = DEFAULT_MODEL): LeagueModel {
  const past = history.filter((m) => m.kickoffAt.getTime() < asOf.getTime()).sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  if (past.length < 50) throw new Error(`fitLeague: only ${past.length} past matches`);

  // Elo over the full history + draw-model samples from pre-match diffs.
  let elo = emptyElo();
  const samples: { diff: number; result: Result }[] = [];
  const burnIn = Math.min(200, Math.floor(past.length / 4));
  past.forEach((m, i) => {
    if (i >= burnIn) samples.push({ diff: eloDiff(elo, m.home, m.away, config.elo), result: resultOf(m) });
    elo = eloUpdate(elo, m, config.elo);
  });
  const drawModel = fitDrawModel(samples);

  // Promoted teams: in the current season but absent from the previous one.
  const seasons = [...new Set(past.map((m) => m.season))].sort();
  const prevSeason = seasons.filter((s) => s < currentSeason).at(-1);
  const inSeason = (s: string | undefined) => new Set(past.filter((m) => m.season === s).flatMap((m) => [m.home, m.away]));
  const prevTeams = inSeason(prevSeason);
  const priors: Record<string, { att: number; def: number }> = {};
  if (prevSeason) for (const t of inSeason(currentSeason)) if (!prevTeams.has(t)) priors[t] = config.promotedPrior;

  const dcData = past
    .filter((m) => asOf.getTime() - m.kickoffAt.getTime() <= config.historyDays * DAY)
    .map((m) => ({ ...m, ageDays: (asOf.getTime() - m.kickoffAt.getTime()) / DAY }));
  const dc = fitDixonColes(dcData, { xi: config.xi, ridge: config.ridge, priors });

  return { asOf, dc, elo, drawModel, config };
}

export interface MatchPrediction {
  dc: DcPrediction;
  elo: ThreeWay;
  /** Blended 1X2 (the model's official 1X2). O/U and BTTS come from Dixon-Coles only. */
  oneXTwo: ThreeWay;
  over25: number;
  btts: number;
}

export function predictMatch(model: LeagueModel, home: string, away: string): MatchPrediction {
  const dc = dcPredict(withPromotedFallback(model, home, away), home, away);
  const elo = eloProbs(eloDiff(model.elo, home, away, model.config.elo), model.drawModel);
  return {
    dc,
    elo,
    oneXTwo: blend(dc, elo, model.config.dcWeight),
    over25: dc.over25,
    btts: dc.bttsYes,
  };
}

// A team never seen by the fit (e.g. first game after promotion) gets the promoted prior.
function withPromotedFallback(model: LeagueModel, home: string, away: string): DcParams {
  const missing = [home, away].filter((t) => !(t in model.dc.attack));
  if (missing.length === 0) return model.dc;
  const { att, def } = model.config.promotedPrior;
  return {
    ...model.dc,
    attack: { ...model.dc.attack, ...Object.fromEntries(missing.map((t) => [t, att])) },
    defence: { ...model.dc.defence, ...Object.fromEntries(missing.map((t) => [t, def])) },
  };
}
