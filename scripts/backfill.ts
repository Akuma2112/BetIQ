/**
 * Backfill historical results + odds from football-data.co.uk. Idempotent: re-running
 * upserts the same natural keys and ignores already-stored odds.
 *
 *   npm run backfill                      # 2022-23 → current season, all leagues
 *   npm run backfill -- --from 2023 --league L1
 *   npm run backfill -- --dry-run         # parse only, no DB (no env needed)
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEAGUES, seasonForDate, type LeagueConfig } from "../src/lib/leagues";
import { fdcoukUrl, parseFdcoukCsv, type FdcoukMatch } from "../src/lib/providers/fdcouk";
import { insertOdds, logApiCall, matchKey, TeamResolver, upsertMatches, type MatchRow } from "../src/lib/ingest/repo";
import { createAdminClient } from "../src/lib/supabase/admin";

config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const refresh = args.includes("--refresh");
const fromYear = Number(flag("from") ?? 2022);
const currentStart = Number(seasonForDate(new Date()).slice(0, 4));
const leagues = flag("league") ? LEAGUES.filter((l) => l.id === flag("league")) : LEAGUES;
const CACHE = join(process.cwd(), "data", "cache");

async function loadCsv(league: LeagueConfig, year: number): Promise<{ csv: string; fetched: boolean }> {
  const file = join(CACHE, `${league.fdcoukCode}_${String(year % 100).padStart(2, "0")}${String((year + 1) % 100).padStart(2, "0")}.csv`);
  // Past seasons are immutable: use the cache. The current season is always refetched.
  if (existsSync(file) && !refresh && year < currentStart) return { csv: readFileSync(file, "utf8"), fetched: false };
  const res = await fetch(fdcoukUrl(league, year), { headers: { "User-Agent": "Mozilla/5.0 BetIQ-backfill" } });
  if (!res.ok) throw new Error(`${fdcoukUrl(league, year)} → ${res.status}`);
  const csv = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, csv);
  return { csv, fetched: true };
}

async function main() {
  const db = dryRun ? null : createAdminClient();
  const resolver = db ? await new TeamResolver(db).load() : null;
  let totalMatches = 0;
  let totalOdds = 0;

  for (const league of leagues) {
    for (let year = fromYear; year <= currentStart; year++) {
      const { csv, fetched } = await loadCsv(league, year);
      const matches = parseFdcoukCsv(csv, year);
      const quotes = matches.reduce((n, m) => n + m.odds.length, 0);
      const closingPinnacle = matches.filter((m) => m.odds.some((q) => q.bookmaker === "pinnacle" && q.isClosing)).length;
      const closingBetfair = matches.filter((m) => m.odds.some((q) => q.bookmaker === "betfair_ex" && q.isClosing)).length;
      console.log(
        `${league.id} ${matches[0]?.season ?? year}: ${matches.length} matches, ${quotes} quotes ` +
          `(closing: pinnacle ${closingPinnacle}, betfair ${closingBetfair})${fetched ? " [downloaded]" : ""}`,
      );
      totalMatches += matches.length;
      totalOdds += quotes;
      if (!db || !resolver) continue;

      if (fetched) {
        await logApiCall(db, { provider: "fdcouk", endpoint: new URL(fdcoukUrl(league, year)).pathname, httpStatus: 200, creditsUsed: 0, creditsRemaining: null }, "backfill");
      }
      const rows: { match: FdcoukMatch; row: MatchRow }[] = [];
      for (const m of matches) {
        const home = await resolver.resolve("fdcouk", league.id, m.homeTeam);
        const away = await resolver.resolve("fdcouk", league.id, m.awayTeam);
        if (!home || !away) continue;
        rows.push({
          match: m,
          row: {
            league_id: league.id,
            season: m.season,
            kickoff_at: m.kickoffAt.toISOString(),
            home_team_id: home,
            away_team_id: away,
            status: "finished",
            home_goals: m.homeGoals,
            away_goals: m.awayGoals,
            home_xg: m.homeXg,
            away_xg: m.awayXg,
          },
        });
      }
      const ids = await upsertMatches(db, rows.map((r) => r.row));
      const odds = rows.flatMap(({ match, row }) => {
        const matchId = ids.get(matchKey(row));
        return matchId ? match.odds.map((quote) => ({ matchId, quote })) : [];
      });
      await insertOdds(db, "fdcouk", odds);
    }
  }
  console.log(`\nTotal: ${totalMatches} matches, ${totalOdds} odds quotes${dryRun ? " (dry run, nothing written)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
