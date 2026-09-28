import { z } from "zod";
import type { LeagueConfig } from "@/lib/leagues";
import type { OddsQuote } from "./types";
import type { ApiCallMeta } from "./usage";

/**
 * The Odds API v4. Cost per call = markets × region-groups, where an explicit
 * `bookmakers` list of ≤ 10 books counts as one region. We request exactly the
 * books we need (sharp refs + FR-licensed), so h2h+totals = 2 credits per league.
 */

const BASE = "https://api.the-odds-api.com/v4";

export const ODDS_API_BOOKMAKERS = [
  "pinnacle",
  "betfair_ex_eu",
  "winamax_fr",
  "betclic_fr",
  "unibet_fr",
  "pmu_fr",
  "netbet_fr",
] as const;
export const ODDS_API_MARKETS = ["h2h", "totals"] as const;

const outcomeSchema = z.object({ name: z.string(), price: z.number(), point: z.number().optional() });
const eventSchema = z.object({
  id: z.string(),
  commence_time: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  bookmakers: z.array(
    z.object({
      key: z.string(),
      last_update: z.string().optional(),
      markets: z.array(z.object({ key: z.string(), last_update: z.string().optional(), outcomes: z.array(outcomeSchema) })),
    }),
  ),
});
export type OddsApiEvent = z.infer<typeof eventSchema>;

// Store Betfair under the same key as the historical CSV data.
const BOOK_KEY: Record<string, string> = { betfair_ex_eu: "betfair_ex" };

/** Flatten one event into quotes (h2h + totals at exactly 2.5). */
export function eventToQuotes(event: OddsApiEvent, capturedAt: Date, isClosing: boolean): OddsQuote[] {
  const out: OddsQuote[] = [];
  for (const book of event.bookmakers) {
    const bookmaker = BOOK_KEY[book.key] ?? book.key;
    for (const market of book.markets) {
      for (const o of market.outcomes) {
        if (!(o.price > 1)) continue;
        if (market.key === "h2h") {
          const outcome = o.name === event.home_team ? "home" : o.name === event.away_team ? "away" : o.name === "Draw" ? "draw" : null;
          if (outcome) out.push({ bookmaker, market: "h2h", outcome, price: o.price, isClosing, capturedAt });
        } else if (market.key === "totals" && o.point === 2.5) {
          const outcome = o.name === "Over" ? "over" : o.name === "Under" ? "under" : null;
          if (outcome) out.push({ bookmaker, market: "totals_2_5", outcome, price: o.price, isClosing, capturedAt });
        }
      }
    }
  }
  return out;
}

function headerInt(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  return v === null ? null : Number(v);
}

export async function fetchOddsApiLeague(
  league: LeagueConfig,
  apiKey: string,
): Promise<{ events: OddsApiEvent[]; meta: ApiCallMeta }> {
  const endpoint =
    `/sports/${league.oddsApiKey}/odds?markets=${ODDS_API_MARKETS.join(",")}` +
    `&bookmakers=${ODDS_API_BOOKMAKERS.join(",")}&oddsFormat=decimal&dateFormat=iso`;
  const res = await fetch(`${BASE}${endpoint}&apiKey=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
  const meta: ApiCallMeta = {
    provider: "odds_api",
    endpoint, // never log the key
    httpStatus: res.status,
    creditsUsed: headerInt(res, "x-requests-last") ?? ODDS_API_MARKETS.length,
    creditsRemaining: headerInt(res, "x-requests-remaining"),
  };
  if (!res.ok) throw Object.assign(new Error(`The Odds API ${res.status} on ${league.oddsApiKey}`), { meta });
  return { events: z.array(eventSchema).parse(await res.json()), meta };
}
