import { z } from "zod";
import type { LeagueConfig } from "@/lib/leagues";
import { seasonLabel } from "@/lib/leagues";
import type { ApiCallMeta } from "./usage";

/** football-data.org v4 — fixtures and results. Free tier: 10 req/min, no monthly cap. */

const BASE = "https://api.football-data.org/v4";

const teamSchema = z.object({ id: z.number().nullable(), name: z.string().nullable(), shortName: z.string().nullable().optional() });
const matchSchema = z.object({
  id: z.number(),
  utcDate: z.string(),
  status: z.string(),
  season: z.object({ startDate: z.string() }),
  homeTeam: teamSchema,
  awayTeam: teamSchema,
  score: z.object({ fullTime: z.object({ home: z.number().nullable(), away: z.number().nullable() }) }),
});
const responseSchema = z.object({ matches: z.array(matchSchema) });

export type FdOrgMatch = z.infer<typeof matchSchema>;
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export interface NormalizedFixture {
  fdOrgId: number;
  season: string;
  kickoffAt: Date;
  status: MatchStatus;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

export function mapStatus(status: string): MatchStatus {
  switch (status) {
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "IN_PLAY":
    case "PAUSED":
    case "LIVE":
      return "live";
    case "POSTPONED":
    case "SUSPENDED":
      return "postponed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "scheduled";
  }
}

export function normalizeFdOrgMatch(m: FdOrgMatch): NormalizedFixture | null {
  const homeName = m.homeTeam.name;
  const awayName = m.awayTeam.name;
  if (!homeName || !awayName) return null; // TBD fixtures
  const status = mapStatus(m.status);
  return {
    fdOrgId: m.id,
    season: seasonLabel(Number(m.season.startDate.slice(0, 4))),
    kickoffAt: new Date(m.utcDate),
    status,
    homeName,
    awayName,
    homeGoals: status === "finished" ? m.score.fullTime.home : null,
    awayGoals: status === "finished" ? m.score.fullTime.away : null,
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Matches of one competition between two dates (API max span: 10 days). */
export async function fetchFdOrgMatches(
  league: LeagueConfig,
  from: Date,
  to: Date,
  token: string,
): Promise<{ fixtures: NormalizedFixture[]; meta: ApiCallMeta }> {
  const endpoint = `/competitions/${league.fdOrgCode}/matches?dateFrom=${isoDay(from)}&dateTo=${isoDay(to)}`;
  const res = await fetch(BASE + endpoint, { headers: { "X-Auth-Token": token }, cache: "no-store" });
  const meta: ApiCallMeta = { provider: "fd_org", endpoint, httpStatus: res.status, creditsUsed: 1, creditsRemaining: null };
  if (!res.ok) throw Object.assign(new Error(`football-data.org ${res.status} on ${endpoint}`), { meta });
  const body = responseSchema.parse(await res.json());
  const fixtures = body.matches.map(normalizeFdOrgMatch).filter((f): f is NormalizedFixture => f !== null);
  return { fixtures, meta };
}
