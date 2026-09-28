import { describe, expect, it } from "vitest";
import { seasonForDate } from "@/lib/leagues";
import { mapStatus, normalizeFdOrgMatch } from "@/lib/providers/fd-org";
import { eventToQuotes, type OddsApiEvent } from "@/lib/providers/odds-api";
import { canSpend } from "@/lib/providers/usage";
import { zonedTimeToUtc } from "@/lib/time";

describe("zonedTimeToUtc", () => {
  it("applies GMT in winter and BST in summer", () => {
    expect(zonedTimeToUtc(2026, 1, 10, 15, 0, "Europe/London").toISOString()).toBe("2026-01-10T15:00:00.000Z");
    expect(zonedTimeToUtc(2026, 8, 22, 12, 30, "Europe/London").toISOString()).toBe("2026-08-22T11:30:00.000Z");
  });
  it("handles the DST switch day", () => {
    // Clocks go forward 29 Mar 2026 at 01:00 GMT
    expect(zonedTimeToUtc(2026, 3, 29, 14, 0, "Europe/London").toISOString()).toBe("2026-03-29T13:00:00.000Z");
  });
});

describe("seasonForDate", () => {
  it("splits seasons at July", () => {
    expect(seasonForDate(new Date("2026-06-30T00:00:00Z"))).toBe("2025-26");
    expect(seasonForDate(new Date("2026-07-01T00:00:00Z"))).toBe("2026-27");
  });
});

describe("football-data.org mapping", () => {
  it("maps statuses", () => {
    expect(mapStatus("TIMED")).toBe("scheduled");
    expect(mapStatus("FINISHED")).toBe("finished");
    expect(mapStatus("PAUSED")).toBe("live");
    expect(mapStatus("POSTPONED")).toBe("postponed");
  });
  it("keeps scores only for finished matches and derives season", () => {
    const base = {
      id: 1,
      utcDate: "2026-09-26T19:00:00Z",
      season: { startDate: "2026-08-14" },
      homeTeam: { id: 1, name: "Paris Saint-Germain FC" },
      awayTeam: { id: 2, name: "Olympique de Marseille" },
      score: { fullTime: { home: 2, away: 1 } },
    };
    expect(normalizeFdOrgMatch({ ...base, status: "FINISHED" })).toMatchObject({ season: "2026-27", homeGoals: 2, status: "finished" });
    expect(normalizeFdOrgMatch({ ...base, status: "IN_PLAY" })).toMatchObject({ homeGoals: null, status: "live" });
    expect(normalizeFdOrgMatch({ ...base, status: "TIMED", homeTeam: { id: null, name: null } })).toBeNull();
  });
});

describe("eventToQuotes", () => {
  const event: OddsApiEvent = {
    id: "abc",
    commence_time: "2026-10-03T19:00:00Z",
    home_team: "Paris Saint Germain",
    away_team: "Marseille",
    bookmakers: [
      {
        key: "pinnacle",
        markets: [
          { key: "h2h", outcomes: [{ name: "Paris Saint Germain", price: 1.5 }, { name: "Draw", price: 4.6 }, { name: "Marseille", price: 6.2 }] },
          { key: "totals", outcomes: [{ name: "Over", price: 1.7, point: 2.5 }, { name: "Under", price: 2.2, point: 2.5 }, { name: "Over", price: 2.4, point: 3.5 }] },
        ],
      },
      { key: "betfair_ex_eu", markets: [{ key: "h2h", outcomes: [{ name: "Draw", price: 4.8 }] }] },
    ],
  };
  it("maps outcomes, keeps only the 2.5 line and renames Betfair", () => {
    const now = new Date("2026-10-03T18:40:00Z");
    const quotes = eventToQuotes(event, now, true);
    expect(quotes).toHaveLength(6);
    expect(quotes.find((q) => q.outcome === "home")).toMatchObject({ bookmaker: "pinnacle", price: 1.5, isClosing: true, capturedAt: now });
    expect(quotes.filter((q) => q.market === "totals_2_5").map((q) => q.price)).toEqual([1.7, 2.2]);
    expect(quotes.find((q) => q.bookmaker === "betfair_ex")?.outcome).toBe("draw");
  });
});

describe("canSpend (quota guard)", () => {
  it("uses the provider's remaining count when known", () => {
    expect(canSpend({ monthlyCredits: 500, lastRemaining: 40, usedThisMonth: 0 }, 2)).toBe(true);
    expect(canSpend({ monthlyCredits: 500, lastRemaining: 26, usedThisMonth: 0 }, 2)).toBe(false);
  });
  it("falls back to logged usage", () => {
    expect(canSpend({ monthlyCredits: 500, lastRemaining: null, usedThisMonth: 470 }, 2)).toBe(true);
    expect(canSpend({ monthlyCredits: 500, lastRemaining: null, usedThisMonth: 474 }, 2)).toBe(false);
  });
});
