import Papa from "papaparse";
import type { LeagueConfig } from "@/lib/leagues";
import { fdcoukSeasonCode, seasonLabel } from "@/lib/leagues";
import { zonedTimeToUtc } from "@/lib/time";
import type { Market, OddsQuote, Outcome } from "./types";

/** Historical results + odds from football-data.co.uk (free CSV, no key). */

export interface FdcoukMatch {
  season: string;
  kickoffAt: Date;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  homeXg: number | null;
  awayXg: number | null;
  odds: OddsQuote[];
}

export function fdcoukUrl(league: LeagueConfig, startYear: number): string {
  return `https://football-data.co.uk/mmz4281/${fdcoukSeasonCode(startYear)}/${league.fdcoukCode}.csv`;
}

// [bookmaker, opening column prefix, closing column prefix]
const BOOKS: [string, string, string][] = [
  ["pinnacle", "PS", "PSC"],
  ["betfair_ex", "BFE", "BFEC"],
  ["market_max", "Max", "MaxC"],
  ["market_avg", "Avg", "AvgC"],
];
// Pinnacle O/U columns use 'P' rather than 'PS'.
const TOTALS_PREFIX: Record<string, [string, string]> = {
  pinnacle: ["P", "PC"],
  betfair_ex: ["BFE", "BFEC"],
  market_max: ["Max", "MaxC"],
  market_avg: ["Avg", "AvgC"],
};

// Opening prices are collected ~2 days before (Fri for weekend, Tue for midweek).
const OPENING_LEAD_MS = 48 * 3600 * 1000;

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseKickoff(date: string, time: string | undefined): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(date.trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const [hh, mm] = (time?.trim() || "15:00").split(":").map(Number);
  // Times in these files are UK local time.
  return zonedTimeToUtc(year, Number(m[2]), Number(m[1]), hh, mm, "Europe/London");
}

function quotes(row: Record<string, string>, kickoffAt: Date): OddsQuote[] {
  const out: OddsQuote[] = [];
  const opening = new Date(kickoffAt.getTime() - OPENING_LEAD_MS);
  const push = (bookmaker: string, market: Market, outcome: Outcome, col: string, isClosing: boolean) => {
    const price = num(row[col]);
    if (price !== null && price > 1) {
      out.push({ bookmaker, market, outcome, price, isClosing, capturedAt: isClosing ? kickoffAt : opening });
    }
  };
  for (const [book, open, close] of BOOKS) {
    for (const [prefix, isClosing] of [[open, false], [close, true]] as const) {
      push(book, "h2h", "home", `${prefix}H`, isClosing);
      push(book, "h2h", "draw", `${prefix}D`, isClosing);
      push(book, "h2h", "away", `${prefix}A`, isClosing);
    }
    const [tOpen, tClose] = TOTALS_PREFIX[book];
    for (const [prefix, isClosing] of [[tOpen, false], [tClose, true]] as const) {
      push(book, "totals_2_5", "over", `${prefix}>2.5`, isClosing);
      push(book, "totals_2_5", "under", `${prefix}<2.5`, isClosing);
    }
  }
  return out;
}

export function parseFdcoukCsv(csv: string, startYear: number): FdcoukMatch[] {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  const season = seasonLabel(startYear);
  const matches: FdcoukMatch[] = [];
  for (const row of parsed.data) {
    const homeGoals = num(row.FTHG);
    const awayGoals = num(row.FTAG);
    if (!row.HomeTeam || !row.AwayTeam || !row.Date || homeGoals === null || awayGoals === null) continue;
    const kickoffAt = parseKickoff(row.Date, row.Time);
    if (!kickoffAt) continue;
    matches.push({
      season,
      kickoffAt,
      homeTeam: row.HomeTeam.trim(),
      awayTeam: row.AwayTeam.trim(),
      homeGoals,
      awayGoals,
      homeXg: num(row.HxG),
      awayXg: num(row.AxG),
      odds: quotes(row, kickoffAt),
    });
  }
  return matches;
}
