import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leagueById } from "@/lib/leagues";
import { fdcoukUrl, parseFdcoukCsv } from "@/lib/providers/fdcouk";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("parseFdcoukCsv", () => {
  it("parses results, UK kickoff time → UTC, and Pinnacle opening/closing odds (2025-26)", () => {
    const [m] = parseFdcoukCsv(fixture("fdcouk_F1_2526.csv"), 2025);
    expect(m).toMatchObject({ season: "2025-26", homeTeam: "Rennes", awayTeam: "Marseille", homeGoals: 1, awayGoals: 0, homeXg: null });
    // 19:45 BST (UTC+1) → 18:45Z
    expect(m.kickoffAt.toISOString()).toBe("2025-08-15T18:45:00.000Z");

    const pick = (book: string, outcome: string, closing: boolean) =>
      m.odds.find((q) => q.bookmaker === book && q.outcome === outcome && q.isClosing === closing)?.price;
    expect(pick("pinnacle", "home", false)).toBe(3.64);
    expect(pick("pinnacle", "home", true)).toBe(3.99);
    expect(pick("pinnacle", "away", true)).toBe(1.97);
    expect(pick("pinnacle", "over", true)).toBe(1.88);
    expect(pick("betfair_ex", "home", true)).toBe(4.1);
    expect(pick("market_max", "draw", true)).toBe(3.75);

    const closing = m.odds.find((q) => q.isClosing)!;
    const opening = m.odds.find((q) => !q.isClosing)!;
    expect(closing.capturedAt.getTime()).toBe(m.kickoffAt.getTime());
    expect(opening.capturedAt.getTime()).toBeLessThan(m.kickoffAt.getTime());
  });

  it("handles 2026-27 files without Pinnacle and with xG", () => {
    const rows = parseFdcoukCsv(fixture("fdcouk_E0_2627.csv"), 2026);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ homeTeam: "Arsenal", awayTeam: "Coventry", homeXg: 1.88, awayXg: 0.2 });
    expect(rows[0].odds.some((q) => q.bookmaker === "pinnacle")).toBe(false);
    expect(rows[0].odds.some((q) => q.bookmaker === "betfair_ex" && q.isClosing)).toBe(true);
  });

  it("skips rows without a final score", () => {
    const csv = "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\nF1,01/09/2026,20:00,Lens,Lyon,,\n";
    expect(parseFdcoukCsv(csv, 2026)).toEqual([]);
  });

  it("builds the season URL", () => {
    expect(fdcoukUrl(leagueById("LIGA"), 2025)).toBe("https://football-data.co.uk/mmz4281/2526/SP1.csv");
  });
});
